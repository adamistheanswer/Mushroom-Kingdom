import { decode, encode } from '@msgpack/msgpack'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import SimplePeer from 'simple-peer'
import useClientAudioStore from '../State/clientsAudioStore'

interface WebSocketMessage {
   type: string
   payload: any
}

type PeerMap = Record<string, SimplePeer.Instance>
type AudioElementMap = Record<string, HTMLAudioElement>
type PendingPeerMap = Record<string, Promise<SimplePeer.Instance | null>>
type SpeechAnalysisMap = Record<
   string,
   {
      audioContext: AudioContext
      source: MediaStreamAudioSourceNode
      animationFrame: number
      speaking: boolean
   }
>

const SIGNAL_BUFFER_LIMIT = 64 * 1024
const DISCONNECTED_ICE_STATES = new Set(['closed', 'failed'])
const SPEAKING_THRESHOLD = 0.035
const SPEAKING_START_DELAY = 80
const SPEAKING_STOP_DELAY = 240

function preferOpusVoiceSettings(sdp: string) {
   return sdp.replace(
      /a=fmtp:111 ([^\r\n]*)/g,
      (_, params) => `a=fmtp:111 ${params};stereo=0;sprop-stereo=0;maxaveragebitrate=32000;usedtx=1`
   )
}

export const useVoiceChat = (socket, clientId) => {
   const peersRef = useRef<PeerMap>({})
   const pendingPeersRef = useRef<PendingPeerMap>({})
   const audioElementsRef = useRef<AudioElementMap>({})
   const speechAnalysisRef = useRef<SpeechAnalysisMap>({})
   const localStreamRef = useRef<MediaStream | null>(null)
   const voiceChatEnabledRef = useRef(false)
   const clientsRef = useRef<Record<string, { microphone?: boolean }>>({})
   const updateSpeakingRef = useRef<(clientId: string, speaking: boolean) => void>(() => {})

   const clients = useClientAudioStore((state) => state.clients)
   const updateClientSpeakingStatus = useClientAudioStore((state) => state.updateClientSpeakingStatus)

   useEffect(() => {
      clientsRef.current = clients
   }, [clients])

   useEffect(() => {
      updateSpeakingRef.current = updateClientSpeakingStatus
   }, [updateClientSpeakingStatus])

   const iceServers = useMemo(
      () => ({
         iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
      }),
      []
   )

   const stopSpeakingDetection = useCallback((targetId: string) => {
      const analysis = speechAnalysisRef.current[targetId]
      if (!analysis) {
         return
      }

      cancelAnimationFrame(analysis.animationFrame)
      analysis.source.disconnect()
      void analysis.audioContext.close()
      delete speechAnalysisRef.current[targetId]
      updateSpeakingRef.current(targetId, false)
   }, [])

   const startSpeakingDetection = useCallback(
      (targetId: string, stream: MediaStream) => {
         stopSpeakingDetection(targetId)

         const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext
         if (!AudioContextConstructor) {
            return
         }

         const audioContext = new AudioContextConstructor()
         const source = audioContext.createMediaStreamSource(stream)
         const analyser = audioContext.createAnalyser()
         let speaking = false
         let pendingSpeaking = false
         let pendingSince = 0

         analyser.fftSize = 512
         analyser.smoothingTimeConstant = 0.6
         const samples = new Uint8Array(analyser.fftSize)
         source.connect(analyser)
         void audioContext.resume()

         const updateSpeaking = (nextSpeaking: boolean) => {
            const now = performance.now()
            const requiredDelay = nextSpeaking ? SPEAKING_START_DELAY : SPEAKING_STOP_DELAY

            if (nextSpeaking !== pendingSpeaking) {
               pendingSpeaking = nextSpeaking
               pendingSince = now
               return
            }

            if (nextSpeaking !== speaking && now - pendingSince >= requiredDelay) {
               const analysis = speechAnalysisRef.current[targetId]
               if (!analysis) {
                  return
               }

               speaking = nextSpeaking
               analysis.speaking = speaking
               updateSpeakingRef.current(targetId, speaking)
            }
         }

         const tick = () => {
            const analysis = speechAnalysisRef.current[targetId]
            if (!analysis) {
               return
            }

            analyser.getByteTimeDomainData(samples)

            let sum = 0
            for (let index = 0; index < samples.length; index++) {
               const value = (samples[index] - 128) / 128
               sum += value * value
            }

            updateSpeaking(Math.sqrt(sum / samples.length) > SPEAKING_THRESHOLD)
            analysis.animationFrame = requestAnimationFrame(tick)
         }

         speechAnalysisRef.current[targetId] = {
            audioContext,
            source,
            animationFrame: requestAnimationFrame(tick),
            speaking,
         }
      },
      [stopSpeakingDetection]
   )

   const destroyPeer = useCallback(
      (targetId: string) => {
         const peer = peersRef.current[targetId]

         if (peer && !peer.destroyed) {
            peer.destroy()
         }

         delete peersRef.current[targetId]

         const audioElement = audioElementsRef.current[targetId]
         if (audioElement) {
            audioElement.pause()
            audioElement.srcObject = null
            audioElement.remove()
            delete audioElementsRef.current[targetId]
         }

         stopSpeakingDetection(targetId)
      },
      [stopSpeakingDetection]
   )

   const stopLocalStream = useCallback(() => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
   }, [])

   const getLocalStream = useCallback(async () => {
      if (localStreamRef.current) {
         return localStreamRef.current
      }

      localStreamRef.current = await navigator.mediaDevices.getUserMedia({
         audio: {
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
            channelCount: { ideal: 1 },
            sampleRate: { ideal: 48000 },
            sampleSize: { ideal: 16 },
         },
      })

      return localStreamRef.current
   }, [])

   const createPeerConnection = useCallback(
      async (targetId: string, initiator: boolean) => {
         if (!socket || !clientId || targetId === clientId || !voiceChatEnabledRef.current) return null

         if (peersRef.current[targetId]) {
            return peersRef.current[targetId]
         }

         if (pendingPeersRef.current[targetId]) {
            return pendingPeersRef.current[targetId]
         }

         pendingPeersRef.current[targetId] = (async () => {
            const stream = await getLocalStream()

            if (!voiceChatEnabledRef.current) {
               return null
            }

            const peer = new SimplePeer({
               initiator,
               trickle: true,
               stream,
               config: iceServers,
               sdpTransform: preferOpusVoiceSettings,
            })

            peersRef.current[targetId] = peer

            peer.on('error', (err) => {
               console.error('Error in peer connection:', err)
               destroyPeer(targetId)
            })

            peer.on('signal', (signal) => {
               if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > SIGNAL_BUFFER_LIMIT) {
                  return
               }

               socket.send(
                  encode({
                     type: 'signal',
                     payload: { targetId, senderId: clientId, signal },
                  })
               )
            })

            peer.on('connect', () => console.log(`Connected to ${targetId}`))

            peer.on('iceStateChange', (state) => {
               if (DISCONNECTED_ICE_STATES.has(state)) {
                  destroyPeer(targetId)
               }
            })

            peer.on('stream', (remoteStream) => {
               startSpeakingDetection(targetId, remoteStream)

               const existingAudio = audioElementsRef.current[targetId]
               if (existingAudio) {
                  existingAudio.srcObject = remoteStream
                  existingAudio.muted = false
                  void existingAudio.play().catch((error) => {
                     console.error('Error playing remote audio:', error)
                  })
                  return
               }

               const audio = new Audio()
               audio.autoplay = true
               audio.playsInline = true
               audio.srcObject = remoteStream
               audio.muted = false
               audio.style.display = 'none'
               document.body.appendChild(audio)
               audio.play().catch((error) => {
                  console.error('Error playing remote audio:', error)
               })
               audioElementsRef.current[targetId] = audio
            })

            peer.on('close', () => {
               console.log(`Disconnected from ${targetId}`)
               destroyPeer(targetId)
            })

            return peer
         })()

         try {
            return await pendingPeersRef.current[targetId]
         } finally {
            delete pendingPeersRef.current[targetId]
         }
      },
      [clientId, destroyPeer, getLocalStream, iceServers, socket, startSpeakingDetection]
   )

   useEffect(() => {
      if (!socket || !clientId) return

      const handleSignal = async (event) => {
         const message = decode(event.data) as WebSocketMessage
         if (message.type !== 'signal' || !voiceChatEnabledRef.current) {
            return
         }

         const { senderId, signal } = message.payload
         if (senderId === clientId) return

         const initiator = clientId > senderId

         const peer = peersRef.current[senderId] ?? (await createPeerConnection(senderId, initiator))
         peer?.signal(signal)
      }

      socket.addEventListener('message', handleSignal)

      return () => {
         socket.removeEventListener('message', handleSignal)
      }
   }, [clientId, createPeerConnection, socket])

   useEffect(() => {
      for (const id in peersRef.current) {
         if (!clients[id]?.microphone) {
            destroyPeer(id)
         }
      }

      for (const id in audioElementsRef.current) {
         audioElementsRef.current[id].muted = false
      }

      if (!voiceChatEnabledRef.current || !clientId) {
         return
      }

      for (const id in clients) {
         if (id !== clientId && clients[id]?.microphone && !peersRef.current[id] && !pendingPeersRef.current[id]) {
            void createPeerConnection(id, clientId > id)
         }
      }
   }, [clientId, clients, createPeerConnection, destroyPeer])

   const stopVoiceChat = useCallback(() => {
      voiceChatEnabledRef.current = false

      for (const id in peersRef.current) {
         destroyPeer(id)
      }

      stopLocalStream()
      if (clientId) {
         stopSpeakingDetection(clientId)
      }
   }, [clientId, destroyPeer, stopLocalStream, stopSpeakingDetection])

   useEffect(() => {
      return () => {
         stopVoiceChat()
      }
   }, [stopVoiceChat])

   const startVoiceChat = useCallback(async () => {
      if (!socket || !clientId || voiceChatEnabledRef.current) return

      voiceChatEnabledRef.current = true

      try {
         const stream = await getLocalStream()
         startSpeakingDetection(clientId, stream)
      } catch (error) {
         voiceChatEnabledRef.current = false
         console.error('Error getting user media:', error)
         throw error
      }

      for (const id in clientsRef.current) {
         if (id !== clientId && clientsRef.current[id]?.microphone) {
            const shouldInitiateConnection = clientId > id
            void createPeerConnection(id, shouldInitiateConnection)
         }
      }
   }, [clientId, createPeerConnection, getLocalStream, socket])

   return { startVoiceChat, stopVoiceChat }
}
