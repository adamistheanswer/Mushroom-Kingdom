import { decode, encode } from '@msgpack/msgpack'
import { useCallback, useEffect, useRef, useState } from 'react'
import SimplePeer from 'simple-peer'

interface WebSocketMessage {
   type: string
   payload: any
}
const iceServers = {
   iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
}

export const useVoiceChat = (socket, clientId, clients) => {
   const peersRef = useRef({})
   const [voiceChatEnabled, setVoiceChatEnabled] = useState(false)
   const userAudioStreamRef = useRef<MediaStream | null>(null)

   console.log(peersRef.current)

   useEffect(() => {
      if (!voiceChatEnabled) {
         if (userAudioStreamRef.current) {
            userAudioStreamRef.current.getAudioTracks().forEach((track) => {
               track.enabled = false
            })
         }
      } else {
         if (userAudioStreamRef.current) {
            userAudioStreamRef.current.getAudioTracks().forEach((track) => {
               track.enabled = true
            })
         }
      }
   }, [voiceChatEnabled])

   useEffect(() => {
      if (!socket || !clientId) return

      const handleSignal = (event) => {
         const message = decode(event.data) as WebSocketMessage
         if (message.type === 'signal') {
            const { senderId, signal } = message.payload
            if (senderId === clientId) return

            console.log(`Received signal from ${senderId}`, signal)

            if (!peersRef.current[senderId]) {
               createPeerConnection(senderId, true)
            }

            peersRef.current[senderId].signal(signal)
         }
      }

      socket.addEventListener('message', handleSignal)

      return () => {
         socket.removeEventListener('message', handleSignal)
      }
   }, [socket, clientId])

   const createPeerConnection = useCallback(
      (targetId, initiator) => {
         if (peersRef.current[targetId]) return

         const peer = new SimplePeer({
            initiator,
            trickle: false,
            config: iceServers,
         })

         peer.on('error', (err) => console.error('Error in peer connection:', err))

         peer.on('signal', (signal) => {
            console.log(`Sending signal to ${targetId}`, signal)
            const message = {
               type: 'signal',
               payload: { targetId, senderId: clientId, signal },
            }
            socket.send(encode(message))
         })

         peer.on('connect', () => console.log(`Connected to ${targetId}`))

         peer.on('track', (track, stream) => {
            console.log(`Received ${track.kind} track from ${targetId}`)
            track.onunmute = () => {
               const audio = new Audio()
               audio.autoplay = true
               audio.muted = false
               audio.srcObject = stream
               audio.play()
            }
         })

         peer.on('close', () => {
            console.log(`Disconnected from ${targetId}`)
            peer.destroy()
            delete peersRef.current[targetId]
         })

         navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => {
               userAudioStreamRef.current = stream
               if (!peer.destroyed) {
                  peer.addStream(stream)
               }
            })
            .catch((error) => {
               console.error('Error getting user media:', error)
            })

         peersRef.current[targetId] = peer
      },
      [clientId, socket]
   )

   const startVoiceChat = useCallback(() => {
      if (!clientId || voiceChatEnabled) return
      setVoiceChatEnabled(true)

      for (const id in clients) {
         if (id !== clientId) {
            // Only the client with the higher clientId will initiate the connection.
            const shouldInitiateConnection = clientId > id
            createPeerConnection(id, shouldInitiateConnection)
         }
      }
   }, [clientId, clients, createPeerConnection, voiceChatEnabled])

   return { startVoiceChat }
}
