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

export const useVoiceChat = (socket, clientId) => {
   const peersRef = useRef<PeerMap>({})
   const pendingPeersRef = useRef<PendingPeerMap>({})
   const audioElementsRef = useRef<AudioElementMap>({})
   const localStreamRef = useRef<MediaStream | null>(null)
   const voiceChatEnabledRef = useRef(false)
   const clientsRef = useRef({})

   const clients = useClientAudioStore((state) => state.clients)

   useEffect(() => {
      clientsRef.current = clients
   }, [clients])

   const iceServers = useMemo(
      () => ({
         iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
      }),
      []
   )

   const destroyPeer = useCallback((targetId: string) => {
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
   }, [])

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
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
         },
      })

      return localStreamRef.current
   }, [])

   const createPeerConnection = useCallback(
      async (targetId: string, initiator: boolean) => {
         if (!socket || !clientId || !voiceChatEnabledRef.current) return null

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
            })

            peersRef.current[targetId] = peer

            peer.on('error', (err) => {
               console.error('Error in peer connection:', err)
               destroyPeer(targetId)
            })

            peer.on('signal', (signal) => {
               if (socket.readyState !== WebSocket.OPEN) {
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

            peer.on('stream', (remoteStream) => {
               const existingAudio = audioElementsRef.current[targetId]
               if (existingAudio) {
                  existingAudio.srcObject = remoteStream
                  return
               }

               const audio = new Audio()
               audio.autoplay = true
               audio.srcObject = remoteStream
               audio.muted = !clientsRef.current[targetId]?.microphone
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
      [clientId, destroyPeer, getLocalStream, iceServers, socket]
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
         if (!clients[id]) {
            destroyPeer(id)
         }
      }

      for (const id in audioElementsRef.current) {
         audioElementsRef.current[id].muted = !clients[id]?.microphone
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
   }, [destroyPeer, stopLocalStream])

   useEffect(() => {
      return () => {
         stopVoiceChat()
      }
   }, [stopVoiceChat])

   const startVoiceChat = useCallback(async () => {
      if (!socket || !clientId || voiceChatEnabledRef.current) return

      voiceChatEnabledRef.current = true

      try {
         await getLocalStream()
      } catch (error) {
         voiceChatEnabledRef.current = false
         console.error('Error getting user media:', error)
         throw error
      }

      for (const id in clientsRef.current) {
         if (id !== clientId) {
            const shouldInitiateConnection = clientId > id
            void createPeerConnection(id, shouldInitiateConnection)
         }
      }
   }, [clientId, createPeerConnection, getLocalStream, socket])

   return { startVoiceChat, stopVoiceChat }
}
