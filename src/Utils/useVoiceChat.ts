import { encode } from '@msgpack/msgpack'
import { useCallback, useEffect, useRef, useState } from 'react'
import SimplePeer from 'simple-peer'
import useClientAudioStore from '../State/clientsAudioStore'
import { WebSocketMessage } from '../Interfaces/websockets'

type PeerRecord = {
   peer: SimplePeer.Instance
   initiator: boolean
   connected: boolean
   disposed: boolean
   connectTimer: number
   iceGraceTimer: number
   bytesReceived: number
   mediaProgressAt: number
}

type PeerMap = Record<string, PeerRecord>
type AudioElementMap = Record<string, HTMLAudioElement>
type PendingSignalMap = Record<string, any[]>
type ReconnectState = { attempts: number; timer: number; gaveUpAt: number }

type SpeechAnalysis = {
   source: MediaStreamAudioSourceNode
   analyser: AnalyserNode
   samples: Uint8Array
   speaking: boolean
   pendingSpeaking: boolean
   pendingSince: number
}

type QueuedSignal = { targetId: string; signal: any; queuedAt: number }

const SIGNAL_BUFFER_LIMIT = 64 * 1024
const SIGNAL_QUEUE_LIMIT = 256
const SIGNAL_MAX_AGE = 10000
const SIGNAL_FLUSH_INTERVAL = 100
const PENDING_SIGNALS_PER_PEER = 64

const CONNECT_TIMEOUT = 20000
const ICE_DISCONNECT_GRACE = 6000
const RECONNECT_BASE_DELAY = 800
const RECONNECT_MAX_DELAY = 15000
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_GIVE_UP_COOLDOWN = 60000

const MEDIA_WATCHDOG_INTERVAL = 3000
const MEDIA_STALL_TIMEOUT = 10000

const SPEAKING_THRESHOLD = 0.035
const SPEAKING_START_DELAY = 80
const SPEAKING_STOP_DELAY = 240
const ANALYSER_FALLBACK_INTERVAL = 250

const ICE_SERVERS_TTL = 5 * 60 * 1000
const ICE_SERVERS_TIMEOUT = 4000

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
   { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
]

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
   echoCancellation: { ideal: true },
   noiseSuppression: { ideal: true },
   autoGainControl: { ideal: true },
   channelCount: { ideal: 1 },
   sampleRate: { ideal: 48000 },
   sampleSize: { ideal: 16 },
}

const OPUS_PARAMS: Record<string, string> = {
   stereo: '0',
   'sprop-stereo': '0',
   maxaveragebitrate: '32000',
   usedtx: '1',
   useinbandfec: '1',
}

let cachedIceServers: RTCIceServer[] = DEFAULT_ICE_SERVERS
let iceServersFetchedAt = 0
let iceServersPromise: Promise<RTCIceServer[]> | null = null

/**
 * TURN relays are what keep voice working behind symmetric NAT, so the server is asked for the
 * live list (credentials never ship in the bundle) and public STUN is the fallback.
 */
async function loadIceServers(): Promise<RTCIceServer[]> {
   if (Date.now() - iceServersFetchedAt < ICE_SERVERS_TTL) {
      return cachedIceServers
   }

   if (!iceServersPromise) {
      iceServersPromise = (async () => {
         const controller = new AbortController()
         const timeout = window.setTimeout(() => controller.abort(), ICE_SERVERS_TIMEOUT)

         try {
            const response = await fetch('/ice-servers', { signal: controller.signal })
            if (!response.ok) {
               throw new Error(`ice-servers responded ${response.status}`)
            }

            const body = await response.json()
            const servers = Array.isArray(body?.iceServers) ? body.iceServers.filter((server) => server?.urls) : []

            cachedIceServers = servers.length > 0 ? servers : DEFAULT_ICE_SERVERS
            iceServersFetchedAt = Date.now()
         } catch (error) {
            // Never let ICE discovery block a call - public STUN still covers most networks.
            cachedIceServers = DEFAULT_ICE_SERVERS
         } finally {
            window.clearTimeout(timeout)
            iceServersPromise = null
         }

         return cachedIceServers
      })()
   }

   return iceServersPromise
}

let sharedAudioContext: AudioContext | null = null

function getSharedAudioContext(): AudioContext | null {
   if (sharedAudioContext && sharedAudioContext.state !== 'closed') {
      return sharedAudioContext
   }

   const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext
   if (!AudioContextConstructor) {
      return null
   }

   // One context for every stream: browsers cap how many can exist at once.
   sharedAudioContext = new AudioContextConstructor()
   return sharedAudioContext
}

const PEER_EVENTS = ['signal', 'connect', 'stream', 'iceStateChange', 'close'] as const
const GESTURE_EVENTS = ['pointerdown', 'touchstart', 'keydown', 'click'] as const
const gestureCallbacks = new Set<() => void>()
let gestureListenersAttached = false

function detachGestureListeners() {
   if (!gestureListenersAttached) {
      return
   }

   gestureListenersAttached = false
   GESTURE_EVENTS.forEach((eventName) => document.removeEventListener(eventName, handleUserGesture, true))
}

function handleUserGesture() {
   detachGestureListeners()
   const callbacks = [...gestureCallbacks]
   gestureCallbacks.clear()
   callbacks.forEach((callback) => callback())
}

function onNextUserGesture(callback: () => void) {
   gestureCallbacks.add(callback)

   if (gestureListenersAttached) {
      return
   }

   gestureListenersAttached = true
   GESTURE_EVENTS.forEach((eventName) => document.addEventListener(eventName, handleUserGesture, true))
}

function mergeOpusParams(existing: string) {
   const params = new Map<string, string>()

   for (const entry of existing.split(';')) {
      const [key, value] = entry.split('=')
      if (key?.trim()) {
         params.set(key.trim(), value?.trim() ?? '')
      }
   }

   for (const key in OPUS_PARAMS) {
      params.set(key, OPUS_PARAMS[key])
   }

   return [...params.entries()].map(([key, value]) => (value === '' ? key : `${key}=${value}`)).join(';')
}

/**
 * Opus payload numbers are negotiated, so a hard-coded `111` cannot be trusted - read the rtpmap
 * and patch whichever payload types the remote actually offered.
 */
function preferOpusVoiceSettings(sdp: string) {
   try {
      const payloadTypes = [...sdp.matchAll(/a=rtpmap:(\d+) opus\/48000/gi)].map((match) => match[1])
      if (payloadTypes.length === 0) {
         return sdp
      }

      let transformed = sdp

      for (const payloadType of payloadTypes) {
         const fmtpPattern = new RegExp(`a=fmtp:${payloadType} ([^\\r\\n]*)`, 'g')

         if (fmtpPattern.test(transformed)) {
            transformed = transformed.replace(
               new RegExp(`a=fmtp:${payloadType} ([^\\r\\n]*)`, 'g'),
               (_, params) => `a=fmtp:${payloadType} ${mergeOpusParams(params)}`
            )
            continue
         }

         transformed = transformed.replace(
            new RegExp(`(a=rtpmap:${payloadType} opus/48000[^\\r\\n]*\\r?\\n)`),
            `$1a=fmtp:${payloadType} ${mergeOpusParams('')}\r\n`
         )
      }

      return transformed
   } catch (error) {
      // A malformed tweak would break the call outright, so fall back to the untouched SDP.
      return sdp
   }
}

function shouldInitiate(localId: string, remoteId: string) {
   return localId > remoteId
}

function describeMediaError(error: any) {
   const name = error?.name

   if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Microphone permission was denied.'
   }

   if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return 'No microphone was found.'
   }

   if (name === 'NotReadableError' || name === 'AbortError') {
      return 'The microphone is in use by another application.'
   }

   return error?.message ? `Microphone unavailable: ${error.message}` : 'Microphone unavailable.'
}

export const useVoiceChat = (socket: WebSocket | null, clientId: string) => {
   const peersRef = useRef<PeerMap>({})
   const pendingPeersRef = useRef<Record<string, Promise<void>>>({})
   const pendingSignalsRef = useRef<PendingSignalMap>({})
   const reconnectRef = useRef<Record<string, ReconnectState>>({})
   const audioElementsRef = useRef<AudioElementMap>({})
   const blockedAudioRef = useRef<Set<string>>(new Set())
   const speechAnalysisRef = useRef<Record<string, SpeechAnalysis>>({})
   const localStreamRef = useRef<MediaStream | null>(null)
   const localStreamPromiseRef = useRef<Promise<MediaStream> | null>(null)
   const outboundSignalsRef = useRef<QueuedSignal[]>([])
   const flushTimerRef = useRef<number | null>(null)
   const animationFrameRef = useRef<number | null>(null)
   const fallbackTimerRef = useRef<number | null>(null)
   const mediaWatchdogRef = useRef<number | null>(null)
   const mediaCheckInFlightRef = useRef(false)
   const lastTickRef = useRef(0)
   const recoveringRef = useRef(false)
   const mutedRef = useRef(false)
   const voiceChatEnabledRef = useRef(false)
   const clientsRef = useRef<Record<string, { microphone?: boolean }>>({})
   const clientIdRef = useRef(clientId)
   const socketRef = useRef<WebSocket | null>(socket)
   const updateSpeakingRef = useRef<(clientId: string, speaking: boolean) => void>(() => {})
   const ensurePeerRef = useRef<(targetId: string) => void>(() => {})
   const recoverStreamRef = useRef<() => void>(() => {})

   const [audioBlocked, setAudioBlocked] = useState(false)
   const [muted, setMutedState] = useState(false)
   const [voiceError, setVoiceError] = useState<string | null>(null)

   const clients = useClientAudioStore((state) => state.clients)
   const updateClientSpeakingStatus = useClientAudioStore((state) => state.updateClientSpeakingStatus)

   useEffect(() => {
      clientsRef.current = clients
   }, [clients])

   useEffect(() => {
      clientIdRef.current = clientId
   }, [clientId])

   useEffect(() => {
      updateSpeakingRef.current = updateClientSpeakingStatus
   }, [updateClientSpeakingStatus])

   // ----- speaking detection -------------------------------------------------

   const runAnalysisTick = useCallback(() => {
      lastTickRef.current = performance.now()
      const now = lastTickRef.current

      for (const targetId in speechAnalysisRef.current) {
         const analysis = speechAnalysisRef.current[targetId]
         analysis.analyser.getByteTimeDomainData(analysis.samples)

         let sum = 0
         for (let index = 0; index < analysis.samples.length; index++) {
            const value = (analysis.samples[index] - 128) / 128
            sum += value * value
         }

         const nextSpeaking = Math.sqrt(sum / analysis.samples.length) > SPEAKING_THRESHOLD

         if (nextSpeaking !== analysis.pendingSpeaking) {
            analysis.pendingSpeaking = nextSpeaking
            analysis.pendingSince = now
            continue
         }

         const requiredDelay = nextSpeaking ? SPEAKING_START_DELAY : SPEAKING_STOP_DELAY
         if (nextSpeaking !== analysis.speaking && now - analysis.pendingSince >= requiredDelay) {
            analysis.speaking = nextSpeaking
            updateSpeakingRef.current(targetId, nextSpeaking)
         }
      }
   }, [])

   const stopAnalysisLoop = useCallback(() => {
      if (animationFrameRef.current !== null) {
         cancelAnimationFrame(animationFrameRef.current)
         animationFrameRef.current = null
      }

      if (fallbackTimerRef.current !== null) {
         window.clearInterval(fallbackTimerRef.current)
         fallbackTimerRef.current = null
      }
   }, [])

   const startAnalysisLoop = useCallback(() => {
      if (animationFrameRef.current === null) {
         const loop = () => {
            if (Object.keys(speechAnalysisRef.current).length === 0) {
               animationFrameRef.current = null
               stopAnalysisLoop()
               return
            }

            runAnalysisTick()
            animationFrameRef.current = requestAnimationFrame(loop)
         }

         animationFrameRef.current = requestAnimationFrame(loop)
      }

      if (fallbackTimerRef.current === null) {
         // Hidden tabs pause rAF, which would otherwise freeze every indicator until refocus.
         fallbackTimerRef.current = window.setInterval(() => {
            if (Object.keys(speechAnalysisRef.current).length === 0) {
               stopAnalysisLoop()
               return
            }

            if (performance.now() - lastTickRef.current >= ANALYSER_FALLBACK_INTERVAL) {
               runAnalysisTick()
            }
         }, ANALYSER_FALLBACK_INTERVAL)
      }
   }, [runAnalysisTick, stopAnalysisLoop])

   const stopSpeakingDetection = useCallback(
      (targetId: string) => {
         const analysis = speechAnalysisRef.current[targetId]
         if (!analysis) {
            return
         }

         delete speechAnalysisRef.current[targetId]

         try {
            analysis.source.disconnect()
            analysis.analyser.disconnect()
         } catch (error) {
            // Disconnecting an already torn-down graph is harmless.
         }

         updateSpeakingRef.current(targetId, false)

         if (Object.keys(speechAnalysisRef.current).length === 0) {
            stopAnalysisLoop()
         }
      },
      [stopAnalysisLoop]
   )

   const startSpeakingDetection = useCallback(
      (targetId: string, stream: MediaStream) => {
         stopSpeakingDetection(targetId)

         if (!targetId || stream.getAudioTracks().length === 0) {
            return
         }

         const audioContext = getSharedAudioContext()
         if (!audioContext) {
            return
         }

         try {
            const source = audioContext.createMediaStreamSource(stream)
            const analyser = audioContext.createAnalyser()
            analyser.fftSize = 512
            analyser.smoothingTimeConstant = 0.6
            source.connect(analyser)

            speechAnalysisRef.current[targetId] = {
               source,
               analyser,
               samples: new Uint8Array(analyser.fftSize),
               speaking: false,
               pendingSpeaking: false,
               pendingSince: performance.now(),
            }

            startAnalysisLoop()
         } catch (error) {
            console.warn('Unable to analyse audio for', targetId, error)
            return
         }

         if (audioContext.state === 'suspended') {
            void audioContext.resume().catch(() => onNextUserGesture(() => void audioContext.resume()))
         }
      },
      [startAnalysisLoop, stopSpeakingDetection]
   )

   // ----- remote audio playback ---------------------------------------------

   const retryBlockedAudio = useCallback(() => {
      if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
         void sharedAudioContext.resume().catch(() => {})
      }

      for (const targetId of [...blockedAudioRef.current]) {
         const audioElement = audioElementsRef.current[targetId]
         if (!audioElement) {
            blockedAudioRef.current.delete(targetId)
            continue
         }

         void audioElement
            .play()
            .then(() => {
               blockedAudioRef.current.delete(targetId)
               if (blockedAudioRef.current.size === 0) {
                  setAudioBlocked(false)
               }
            })
            .catch(() => {})
      }
   }, [])

   const playRemoteAudio = useCallback(
      (targetId: string, audioElement: HTMLAudioElement) => {
         void audioElement
            .play()
            .then(() => {
               blockedAudioRef.current.delete(targetId)
               if (blockedAudioRef.current.size === 0) {
                  setAudioBlocked(false)
               }
            })
            .catch(() => {
               // Autoplay policy blocks playback until the page has been interacted with.
               blockedAudioRef.current.add(targetId)
               setAudioBlocked(true)
               onNextUserGesture(() => retryBlockedAudio())
            })
      },
      [retryBlockedAudio]
   )

   const attachRemoteStream = useCallback(
      (targetId: string, remoteStream: MediaStream) => {
         startSpeakingDetection(targetId, remoteStream)

         let audioElement = audioElementsRef.current[targetId]

         if (!audioElement) {
            audioElement = new Audio()
            audioElement.autoplay = true
            audioElement.playsInline = true
            audioElement.style.display = 'none'
            audioElement.addEventListener('pause', () => {
               // Mobile browsers pause background media; resume as soon as we are allowed to.
               const element = audioElementsRef.current[targetId]
               if (element === audioElement && audioElement.srcObject) {
                  playRemoteAudio(targetId, audioElement)
               }
            })
            document.body.appendChild(audioElement)
            audioElementsRef.current[targetId] = audioElement
         }

         audioElement.srcObject = remoteStream
         audioElement.muted = false
         audioElement.volume = 1
         playRemoteAudio(targetId, audioElement)
      },
      [playRemoteAudio, startSpeakingDetection]
   )

   // ----- signalling ---------------------------------------------------------

   const clearFlushTimer = useCallback(() => {
      if (flushTimerRef.current !== null) {
         window.clearInterval(flushTimerRef.current)
         flushTimerRef.current = null
      }
   }, [])

   const flushOutboundSignals = useCallback(() => {
      const queue = outboundSignalsRef.current
      const activeSocket = socketRef.current
      const localId = clientIdRef.current

      if (queue.length === 0) {
         clearFlushTimer()
         return
      }

      if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN || !localId) {
         // Keep ticking: the socket may reopen, or our client id may still be in flight.
         if (flushTimerRef.current === null) {
            flushTimerRef.current = window.setInterval(() => flushOutboundSignals(), SIGNAL_FLUSH_INTERVAL)
         }
         return
      }

      while (queue.length > 0) {
         if (activeSocket.bufferedAmount > SIGNAL_BUFFER_LIMIT) {
            break
         }

         const queued = queue[0]

         if (Date.now() - queued.queuedAt > SIGNAL_MAX_AGE) {
            queue.shift()
            continue
         }

         try {
            activeSocket.send(
               encode({
                  type: 'signal',
                  payload: { targetId: queued.targetId, senderId: localId, signal: queued.signal },
               })
            )
            queue.shift()
         } catch (error) {
            console.warn('Failed to send a voice signal, will retry', error)
            break
         }
      }

      if (queue.length === 0) {
         clearFlushTimer()
      } else if (flushTimerRef.current === null) {
         flushTimerRef.current = window.setInterval(() => flushOutboundSignals(), SIGNAL_FLUSH_INTERVAL)
      }
   }, [clearFlushTimer])

   /** Signals are queued rather than dropped - a lost offer or candidate strands the call forever. */
   const sendSignal = useCallback(
      (targetId: string, signal: any) => {
         const queue = outboundSignalsRef.current
         queue.push({ targetId, signal, queuedAt: Date.now() })

         while (queue.length > SIGNAL_QUEUE_LIMIT) {
            queue.shift()
         }

         flushOutboundSignals()
      },
      [flushOutboundSignals]
   )

   const dropOutboundSignals = useCallback(
      (targetId: string) => {
         outboundSignalsRef.current = outboundSignalsRef.current.filter((queued) => queued.targetId !== targetId)
         if (outboundSignalsRef.current.length === 0) {
            clearFlushTimer()
         }
      },
      [clearFlushTimer]
   )

   // ----- peer lifecycle -----------------------------------------------------

   const cancelReconnect = useCallback((targetId: string) => {
      const state = reconnectRef.current[targetId]
      if (state?.timer) {
         window.clearTimeout(state.timer)
      }
      delete reconnectRef.current[targetId]
   }, [])

   const releaseAudio = useCallback(
      (targetId: string) => {
         const audioElement = audioElementsRef.current[targetId]
         if (audioElement) {
            audioElement.pause()
            audioElement.srcObject = null
            audioElement.remove()
            delete audioElementsRef.current[targetId]
         }

         blockedAudioRef.current.delete(targetId)
         if (blockedAudioRef.current.size === 0) {
            setAudioBlocked(false)
         }

         stopSpeakingDetection(targetId)
      },
      [stopSpeakingDetection]
   )

   const destroyPeer = useCallback(
      (targetId: string, options: { keepAudio?: boolean } = {}) => {
         const record = peersRef.current[targetId]

         if (record) {
            record.disposed = true
            window.clearTimeout(record.connectTimer)
            window.clearTimeout(record.iceGraceTimer)
            delete peersRef.current[targetId]

            try {
               // Drop our own listeners only: simple-peer keeps internal ones (and an attached
               // `error` listener is what stops a late failure throwing as an unhandled event).
               PEER_EVENTS.forEach((eventName) => record.peer.removeAllListeners?.(eventName))
               if (!record.peer.destroyed) {
                  record.peer.destroy()
               }
            } catch (error) {
               // simple-peer throws if torn down mid-negotiation; there is nothing left to clean up.
            }
         }

         delete pendingSignalsRef.current[targetId]
         dropOutboundSignals(targetId)

         if (!options.keepAudio) {
            releaseAudio(targetId)
         }
      },
      [dropOutboundSignals, releaseAudio]
   )

   const scheduleReconnect = useCallback(
      (targetId: string) => {
         if (!voiceChatEnabledRef.current || !clientIdRef.current) {
            return
         }

         if (!clientsRef.current[targetId]?.microphone) {
            cancelReconnect(targetId)
            return
         }

         const state = reconnectRef.current[targetId] ?? { attempts: 0, timer: 0, gaveUpAt: 0 }

         if (state.timer) {
            return
         }

         if (state.attempts >= MAX_RECONNECT_ATTEMPTS) {
            // Park the peer rather than simply forgetting it: the roster changes on every
            // speaking flip in the room, and an unparked peer would be rebuilt from scratch the
            // next time anyone says a word. Release the audio and stale speaking state with it.
            console.warn(`Giving up reconnecting voice chat to ${targetId}`)
            state.gaveUpAt = Date.now()
            state.attempts = 0
            reconnectRef.current[targetId] = state
            destroyPeer(targetId)
            return
         }

         const backoff = Math.min(RECONNECT_BASE_DELAY * 2 ** state.attempts, RECONNECT_MAX_DELAY)
         const delay = backoff / 2 + Math.random() * (backoff / 2)

         state.attempts += 1
         state.timer = window.setTimeout(() => {
            const current = reconnectRef.current[targetId]
            if (current) {
               current.timer = 0
            }
            ensurePeerRef.current(targetId)
         }, delay)

         reconnectRef.current[targetId] = state
      },
      [cancelReconnect, destroyPeer]
   )

   const restartPeer = useCallback(
      (targetId: string) => {
         // Keep the audio element around so a quick renegotiation does not blink the stream out.
         destroyPeer(targetId, { keepAudio: true })
         scheduleReconnect(targetId)
      },
      [destroyPeer, scheduleReconnect]
   )

   // ----- media watchdog -----------------------------------------------------

   const stopMediaWatchdog = useCallback(() => {
      if (mediaWatchdogRef.current !== null) {
         window.clearInterval(mediaWatchdogRef.current)
         mediaWatchdogRef.current = null
      }
   }, [])

   /**
    * ICE reporting `connected` is not proof that audio is arriving: a dead relay or a half-open
    * connection reads as healthy while the room hears silence, which is the failure players
    * notice most. Opus DTX keeps emitting comfort noise while nobody is talking, so a peer whose
    * inbound byte count stops moving altogether is genuinely broken rather than merely quiet.
    */
   const sweepMediaFlow = useCallback(
      async (targetIds: string[]) => {
         for (const targetId of targetIds) {
            const record = peersRef.current[targetId]

            if (!record || !record.connected || record.disposed) {
               continue
            }

            const connection = (record.peer as any)?._pc as RTCPeerConnection | undefined
            if (typeof connection?.getStats !== 'function') {
               continue
            }

            let received = 0

            try {
               const stats = await connection.getStats()
               stats.forEach((report: any) => {
                  if (report.type === 'inbound-rtp' && report.kind !== 'video') {
                     received += report.bytesReceived ?? 0
                  }
               })
            } catch (error) {
               // getStats rejects once a connection is closing; the close handler owns that case.
               continue
            }

            // Awaiting the stats gives the peer time to be torn down underneath us.
            if (peersRef.current[targetId] !== record || record.disposed) {
               continue
            }

            if (received > record.bytesReceived) {
               record.bytesReceived = received
               record.mediaProgressAt = Date.now()
               continue
            }

            if (Date.now() - record.mediaProgressAt > MEDIA_STALL_TIMEOUT) {
               console.warn(`No audio arriving from ${targetId}, rebuilding the connection`)
               restartPeer(targetId)
            }
         }
      },
      [restartPeer]
   )

   const checkMediaFlow = useCallback(async () => {
      // A slow sweep must not overlap the next tick and count the same stall twice.
      if (mediaCheckInFlightRef.current) {
         return
      }

      const targetIds = Object.keys(peersRef.current)

      if (targetIds.length === 0) {
         stopMediaWatchdog()
         return
      }

      mediaCheckInFlightRef.current = true

      try {
         await sweepMediaFlow(targetIds)
      } finally {
         mediaCheckInFlightRef.current = false
      }
   }, [stopMediaWatchdog, sweepMediaFlow])

   const startMediaWatchdog = useCallback(() => {
      if (mediaWatchdogRef.current !== null) {
         return
      }

      mediaWatchdogRef.current = window.setInterval(() => void checkMediaFlow(), MEDIA_WATCHDOG_INTERVAL)
   }, [checkMediaFlow])

   const applySignal = useCallback(
      (targetId: string, signal: any) => {
         const record = peersRef.current[targetId]
         if (!record || record.disposed || record.peer.destroyed) {
            return
         }

         try {
            record.peer.signal(signal)
         } catch (error) {
            console.warn('Rejected a voice signal from', targetId, error)
            restartPeer(targetId)
         }
      },
      [restartPeer]
   )

   const flushPendingSignals = useCallback(
      (targetId: string) => {
         const queued = pendingSignalsRef.current[targetId]
         if (!queued) {
            return
         }

         delete pendingSignalsRef.current[targetId]
         queued.forEach((signal) => applySignal(targetId, signal))
      },
      [applySignal]
   )

   const acquireLocalStream = useCallback(async (force = false) => {
      const existing = localStreamRef.current

      if (!force && existing && existing.getAudioTracks().some((track) => track.readyState === 'live')) {
         return existing
      }

      if (!force && localStreamPromiseRef.current) {
         return localStreamPromiseRef.current
      }

      if (!navigator?.mediaDevices?.getUserMedia) {
         throw new Error('Microphone access needs a secure (https) connection.')
      }

      const request = navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS }).then((stream) => {
         localStreamRef.current = stream

         stream.getAudioTracks().forEach((track) => {
            // A mic swapped in mid-call must not un-mute the player behind their back.
            track.enabled = !mutedRef.current

            track.addEventListener('ended', () => {
               if (localStreamRef.current === stream && voiceChatEnabledRef.current) {
                  recoverStreamRef.current()
               }
            })
         })

         return stream
      })

      localStreamPromiseRef.current = request

      try {
         return await request
      } finally {
         if (localStreamPromiseRef.current === request) {
            localStreamPromiseRef.current = null
         }
      }
   }, [])

   const ensurePeer = useCallback(
      (targetId: string) => {
         const localId = clientIdRef.current

         if (!socketRef.current || !localId || targetId === localId || !voiceChatEnabledRef.current) {
            return
         }

         if (peersRef.current[targetId] || pendingPeersRef.current[targetId]) {
            return
         }

         if (!clientsRef.current[targetId]?.microphone) {
            return
         }

         const parked = reconnectRef.current[targetId]
         if (parked?.gaveUpAt) {
            if (Date.now() - parked.gaveUpAt < RECONNECT_GIVE_UP_COOLDOWN) {
               return
            }

            // The cooldown has run out, so let the backoff ladder start again from the top.
            parked.gaveUpAt = 0
            parked.attempts = 0
         }

         const initiator = shouldInitiate(localId, targetId)

         pendingPeersRef.current[targetId] = (async () => {
            try {
               const [stream, iceServers] = await Promise.all([acquireLocalStream(), loadIceServers()])

               if (
                  !voiceChatEnabledRef.current ||
                  clientIdRef.current !== localId ||
                  peersRef.current[targetId] ||
                  !clientsRef.current[targetId]?.microphone
               ) {
                  return
               }

               const peer = new SimplePeer({
                  initiator,
                  trickle: true,
                  stream,
                  config: { iceServers, iceCandidatePoolSize: 2 },
                  sdpTransform: preferOpusVoiceSettings,
               })

               const record: PeerRecord = {
                  peer,
                  initiator,
                  connected: false,
                  disposed: false,
                  connectTimer: 0,
                  iceGraceTimer: 0,
                  bytesReceived: 0,
                  mediaProgressAt: 0,
               }

               peersRef.current[targetId] = record

               // A peer that never reaches `connect` would otherwise sit half-open forever.
               record.connectTimer = window.setTimeout(() => {
                  if (peersRef.current[targetId] === record && !record.connected) {
                     console.warn(`Voice connection to ${targetId} timed out, retrying`)
                     restartPeer(targetId)
                  }
               }, CONNECT_TIMEOUT)

               peer.on('signal', (signal) => {
                  if (peersRef.current[targetId] !== record) {
                     return
                  }
                  sendSignal(targetId, signal)
               })

               peer.on('connect', () => {
                  if (peersRef.current[targetId] !== record) {
                     return
                  }

                  record.connected = true
                  record.mediaProgressAt = Date.now()
                  window.clearTimeout(record.connectTimer)
                  window.clearTimeout(record.iceGraceTimer)
                  record.iceGraceTimer = 0
                  cancelReconnect(targetId)
                  setVoiceError(null)
                  startMediaWatchdog()
               })

               peer.on('stream', (remoteStream: MediaStream) => {
                  if (peersRef.current[targetId] !== record) {
                     return
                  }
                  attachRemoteStream(targetId, remoteStream)
               })

               peer.on('iceStateChange', (state: string) => {
                  if (peersRef.current[targetId] !== record) {
                     return
                  }

                  if (state === 'connected' || state === 'completed') {
                     if (!record.connected) {
                        record.mediaProgressAt = Date.now()
                     }

                     record.connected = true
                     window.clearTimeout(record.iceGraceTimer)
                     window.clearTimeout(record.connectTimer)
                     record.iceGraceTimer = 0
                     cancelReconnect(targetId)
                     startMediaWatchdog()
                     return
                  }

                  if (state === 'disconnected') {
                     // `disconnected` is usually a blip on mobile networks, so let it recover first.
                     if (!record.iceGraceTimer) {
                        record.iceGraceTimer = window.setTimeout(() => {
                           if (peersRef.current[targetId] === record) {
                              restartPeer(targetId)
                           }
                        }, ICE_DISCONNECT_GRACE)
                     }
                     return
                  }

                  if (state === 'failed' || state === 'closed') {
                     restartPeer(targetId)
                  }
               })

               peer.on('error', (error) => {
                  if (peersRef.current[targetId] !== record) {
                     return
                  }

                  console.warn(`Voice connection error with ${targetId}`, error)
                  restartPeer(targetId)
               })

               peer.on('close', () => {
                  if (peersRef.current[targetId] !== record || record.disposed) {
                     return
                  }
                  restartPeer(targetId)
               })

               flushPendingSignals(targetId)
            } catch (error) {
               if (voiceChatEnabledRef.current) {
                  console.warn(`Unable to open a voice connection to ${targetId}`, error)
                  setVoiceError(describeMediaError(error))
                  scheduleReconnect(targetId)
               }
            } finally {
               delete pendingPeersRef.current[targetId]
            }
         })()
      },
      [
         acquireLocalStream,
         attachRemoteStream,
         cancelReconnect,
         flushPendingSignals,
         restartPeer,
         scheduleReconnect,
         sendSignal,
         startMediaWatchdog,
      ]
   )

   useEffect(() => {
      ensurePeerRef.current = ensurePeer
   }, [ensurePeer])

   const handleIncomingSignal = useCallback(
      (senderId: string, signal: any) => {
         const localId = clientIdRef.current

         if (!voiceChatEnabledRef.current || !localId || !senderId || senderId === localId || !signal) {
            return
         }

         const record = peersRef.current[senderId]

         if (record && !record.disposed) {
            // Glare: both sides opened an offer. Roles are decided by id, so the initiator wins.
            if (signal.type === 'offer' && record.initiator && !record.connected) {
               return
            }

            applySignal(senderId, signal)
            return
         }

         const parked = reconnectRef.current[senderId]
         if (parked?.gaveUpAt && Date.now() - parked.gaveUpAt < RECONNECT_GIVE_UP_COOLDOWN) {
            // Answering here would let a peer we cannot reach clear its own cooldown by simply
            // re-offering, which is exactly the loop parking it was meant to break.
            return
         }

         const queued = pendingSignalsRef.current[senderId] ?? []
         queued.push(signal)
         pendingSignalsRef.current[senderId] = queued.slice(-PENDING_SIGNALS_PER_PEER)

         cancelReconnect(senderId)
         ensurePeer(senderId)
      },
      [applySignal, cancelReconnect, ensurePeer]
   )

   const handleVoiceMessage = useCallback(
      (message: WebSocketMessage) => {
         if (message.type === 'signal') {
            const { senderId, signal } = message.payload ?? {}
            handleIncomingSignal(senderId, signal)
            return
         }

         if (message.type === 'signalUnavailable') {
            // The target vanished between our send and the server's lookup. Tear the half-open
            // peer down and let the capped backoff decide whether they are worth chasing.
            const targetId = message.payload?.targetId
            if (targetId) {
               restartPeer(targetId)
            }
         }
      },
      [handleIncomingSignal, restartPeer]
   )

   // ----- local stream recovery ---------------------------------------------

   const stopLocalStream = useCallback(() => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
      localStreamPromiseRef.current = null
   }, [])

   const recoverLocalStream = useCallback(async () => {
      if (!voiceChatEnabledRef.current || recoveringRef.current) {
         return
      }

      recoveringRef.current = true
      const previousStream = localStreamRef.current
      const previousTrack = previousStream?.getAudioTracks()[0] ?? null

      try {
         const stream = await acquireLocalStream(true)

         if (!voiceChatEnabledRef.current) {
            return
         }

         const nextTrack = stream.getAudioTracks()[0] ?? null
         startSpeakingDetection(clientIdRef.current, stream)

         for (const targetId in peersRef.current) {
            const record = peersRef.current[targetId]
            let replaced = false

            if (previousTrack && previousStream && nextTrack && record.connected) {
               try {
                  record.peer.replaceTrack(previousTrack, nextTrack, previousStream)
                  replaced = true
               } catch (error) {
                  replaced = false
               }
            }

            if (!replaced) {
               restartPeer(targetId)
            }
         }

         if (previousStream && previousStream !== stream) {
            previousStream.getTracks().forEach((track) => track.stop())
         }

         setVoiceError(null)
      } catch (error) {
         console.warn('Lost the microphone and could not recover it', error)
         setVoiceError(describeMediaError(error))
      } finally {
         recoveringRef.current = false
      }
   }, [acquireLocalStream, restartPeer, startSpeakingDetection])

   useEffect(() => {
      recoverStreamRef.current = () => void recoverLocalStream()
   }, [recoverLocalStream])

   useEffect(() => {
      const mediaDevices = navigator?.mediaDevices
      if (!mediaDevices?.addEventListener) {
         return
      }

      const handleDeviceChange = () => {
         if (!voiceChatEnabledRef.current) {
            return
         }

         const tracks = localStreamRef.current?.getAudioTracks() ?? []
         if (tracks.length === 0 || tracks.every((track) => track.readyState === 'ended')) {
            void recoverLocalStream()
         }
      }

      mediaDevices.addEventListener('devicechange', handleDeviceChange)
      return () => mediaDevices.removeEventListener('devicechange', handleDeviceChange)
   }, [recoverLocalStream])

   // ----- socket lifecycle ---------------------------------------------------

   useEffect(() => {
      socketRef.current = socket

      if (!socket) {
         return
      }

      const handleOpen = () => flushOutboundSignals()
      socket.addEventListener('open', handleOpen)
      flushOutboundSignals()

      return () => {
         socket.removeEventListener('open', handleOpen)
      }
   }, [flushOutboundSignals, socket])

   // ----- roster reconciliation ---------------------------------------------

   useEffect(() => {
      for (const id in peersRef.current) {
         if (!clients[id]?.microphone) {
            destroyPeer(id)
            cancelReconnect(id)
         }
      }

      for (const id in reconnectRef.current) {
         if (!clients[id]?.microphone) {
            cancelReconnect(id)
         }
      }

      // `restartPeer` keeps the audio element and analyser alive across a renegotiation so the
      // stream does not blink out. When that reconnect is then cancelled - the peer left voice
      // mid-restart - no peer owns them any more, so sweep whatever is left behind.
      const audioOwners = new Set([...Object.keys(audioElementsRef.current), ...Object.keys(speechAnalysisRef.current)])

      for (const id of audioOwners) {
         if (id !== clientId && !peersRef.current[id] && !clients[id]?.microphone) {
            releaseAudio(id)
         }
      }

      for (const id in pendingSignalsRef.current) {
         // Only drop queued signals once the sender is gone - their offer can arrive a tick
         // before the roster learns their microphone is on.
         if (!clients[id]) {
            delete pendingSignalsRef.current[id]
         }
      }

      if (!voiceChatEnabledRef.current || !clientId) {
         return
      }

      for (const id in clients) {
         if (id !== clientId && clients[id]?.microphone) {
            ensurePeer(id)
         }
      }
   }, [cancelReconnect, clientId, clients, destroyPeer, ensurePeer, releaseAudio])

   // ----- public API ---------------------------------------------------------

   /**
    * Muting flips `enabled` on the local tracks rather than tearing the call down: the peer
    * connections stay warm, so unmuting is instant and nobody has to renegotiate.
    */
   const setMuted = useCallback((nextMuted: boolean) => {
      mutedRef.current = nextMuted
      setMutedState(nextMuted)

      localStreamRef.current?.getAudioTracks().forEach((track) => {
         track.enabled = !nextMuted
      })

      if (!nextMuted || !clientIdRef.current) {
         return
      }

      // A disabled track only reads as silence, which would take the stop delay to register.
      // Drop our own speaking indicator immediately instead.
      const analysis = speechAnalysisRef.current[clientIdRef.current]
      if (analysis) {
         analysis.speaking = false
         analysis.pendingSpeaking = false
         analysis.pendingSince = performance.now()
      }

      updateSpeakingRef.current(clientIdRef.current, false)
   }, [])

   const teardown = useCallback(() => {
      voiceChatEnabledRef.current = false

      for (const id in peersRef.current) {
         destroyPeer(id)
      }

      for (const id in reconnectRef.current) {
         cancelReconnect(id)
      }

      // Anything a cancelled restart left behind outlives its peer, so sweep by element rather
      // than by peer.
      for (const id in audioElementsRef.current) {
         releaseAudio(id)
      }

      for (const id in speechAnalysisRef.current) {
         stopSpeakingDetection(id)
      }

      pendingSignalsRef.current = {}
      outboundSignalsRef.current = []
      mutedRef.current = false
      clearFlushTimer()
      stopAnalysisLoop()
      stopMediaWatchdog()
      stopLocalStream()
   }, [
      cancelReconnect,
      clearFlushTimer,
      destroyPeer,
      releaseAudio,
      stopAnalysisLoop,
      stopLocalStream,
      stopMediaWatchdog,
      stopSpeakingDetection,
   ])

   const stopVoiceChat = useCallback(() => {
      teardown()
      setAudioBlocked(false)
      setMutedState(false)
      setVoiceError(null)
   }, [teardown])

   const startVoiceChat = useCallback(async () => {
      if (!socketRef.current || !clientId || voiceChatEnabledRef.current) {
         return
      }

      voiceChatEnabledRef.current = true
      setVoiceError(null)

      let stream: MediaStream

      try {
         stream = await acquireLocalStream()
      } catch (error) {
         voiceChatEnabledRef.current = false
         stopLocalStream()
         const message = describeMediaError(error)
         setVoiceError(message)
         throw new Error(message)
      }

      if (!voiceChatEnabledRef.current) {
         return
      }

      startSpeakingDetection(clientId, stream)
      void loadIceServers()

      for (const id in clientsRef.current) {
         if (id !== clientId && clientsRef.current[id]?.microphone) {
            ensurePeer(id)
         }
      }
   }, [acquireLocalStream, clientId, ensurePeer, startSpeakingDetection, stopLocalStream])

   // Held in a ref so a re-created `teardown` can never tear down a live call mid-session.
   const teardownRef = useRef(teardown)

   useEffect(() => {
      teardownRef.current = teardown
   }, [teardown])

   useEffect(() => {
      return () => {
         teardownRef.current()
         detachGestureListeners()
      }
   }, [])

   return {
      startVoiceChat,
      stopVoiceChat,
      handleVoiceMessage,
      retryBlockedAudio,
      setMuted,
      audioBlocked,
      muted,
      voiceError,
   }
}
