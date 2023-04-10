import { decode, encode } from '@msgpack/msgpack'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SimplePeer from 'simple-peer'
import useClientAudioStore from '../State/clientsAudioStore'

interface WebSocketMessage {
   type: string
   payload: any
}

export const useVoiceChat = (socket, clientId) => {
   const peersRef = useRef({})
   const audioElementsRef = useRef({})
   const [remoteAudioMuted, setRemoteAudioMuted] = useState({})
   const [voiceChatEnabled, setVoiceChatEnabled] = useState(false)

   const clients = useClientAudioStore((state) => state.clients)

   const iceServers = useMemo(
      () => ({
         iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
      }),
      []
   )

   useEffect(() => {
      if (!socket || !clientId) return

      const handleSignal = (event) => {
         const message = decode(event.data) as WebSocketMessage
         if (message.type === 'signal') {
            const { senderId, signal } = message.payload
            if (senderId === clientId) return

            const initiator = clientId > senderId

            if (!peersRef.current[senderId]) {
               createPeerConnection(senderId, initiator)
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
               audio.muted = remoteAudioMuted[targetId]
               audio.srcObject = stream
               audio.play()
               audioElementsRef.current[targetId] = audio
            }
         })

         peer.on('close', () => {
            console.log(`Disconnected from ${targetId}`)
            peer.destroy()
            delete peersRef.current[targetId]
            if (audioElementsRef.current[targetId]) {
               audioElementsRef.current[targetId].pause()
               audioElementsRef.current[targetId].srcObject = null
               delete audioElementsRef.current[targetId]
            }
         })

         navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => {
               if (!peer.destroyed) {
                  peer.addStream(stream)
               }
            })
            .catch((error) => {
               console.error('Error getting user media:', error)
            })

         peersRef.current[targetId] = peer
      },
      [clientId, socket, clients, remoteAudioMuted]
   )

   useEffect(() => {
      return () => {
         for (const id in audioElementsRef.current) {
            if (audioElementsRef.current[id]) {
               audioElementsRef.current[id].pause()
               audioElementsRef.current[id].srcObject = null
            }
         }
      }
   }, [])

   useEffect(() => {
      const updatedRemoteAudioMuted = {}
      for (const id in clients) {
         if (id !== clientId) {
            updatedRemoteAudioMuted[id] = !clients[id]?.microphone
         }
      }
      setRemoteAudioMuted(updatedRemoteAudioMuted)
   }, [clientId, clients])

   useEffect(() => {
      for (const id in peersRef.current) {
         const peer = peersRef.current[id]
         if (peer && peer.streams && peer.streams[0]) {
            const audioTracks = peer.streams[0].getAudioTracks()
            if (audioTracks.length > 0) {
               audioTracks[0].enabled = !remoteAudioMuted[id]
            }
         }

         const audioElement = audioElementsRef.current[id]
         if (audioElement) {
            audioElement.muted = remoteAudioMuted[id] || !clients[id]?.microphone
         }
      }
   }, [remoteAudioMuted, clients])

   const startVoiceChat = useCallback(() => {
      if (!clientId || voiceChatEnabled) return
      setVoiceChatEnabled(true)

      for (const id in clients) {
         if (id !== clientId) {
            const shouldInitiateConnection = clientId > id
            createPeerConnection(id, shouldInitiateConnection)
         }
      }
   }, [clientId, clients, createPeerConnection, voiceChatEnabled])

   return { startVoiceChat }
}
