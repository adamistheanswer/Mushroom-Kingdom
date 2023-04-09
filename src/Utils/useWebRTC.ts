import { decode, encode } from '@msgpack/msgpack'
import { useEffect, useRef } from 'react'
import SimplePeer from 'simple-peer'
import { WebSocketMessage } from '../Interfaces/websockets'

const SIGNAL_OFFER = 'signal_offer'
const SIGNAL_ANSWER = 'signal_answer'
const SIGNAL_ICE_CANDIDATE = 'signal_ice_candidate'

function useWebRTC(socket, clientId, clients, voiceChatEnabled) {
   const peersRef = useRef({})

   useEffect(() => {
      socket.addEventListener('message', handleMessageSignal)
      return () => {
         socket.removeEventListener('message', handleMessageSignal)
      }
   }, [socket])

   useEffect(() => {
      if (!socket || !clientId || !voiceChatEnabled) return

      Object.keys(clients).forEach((id) => {
         if (clients[clientId].voiceChatEnabled) {
            if (id !== clientId && !peersRef.current[id]) {
               createPeerConnection(id)
            }
         }
      })

      // Clean up old peer connections
      Object.keys(peersRef.current).forEach((id) => {
         if (!clients[id]) {
            peersRef.current[id].destroy()
            delete peersRef.current[id]
         }
      })
   }, [clients, clientId, socket])

   function createPeerConnection(targetId) {
      console.log(targetId)
      const peer = new SimplePeer({ initiator: true, trickle: false })

      peer.on('error', (err) => {
         console.error(`Error in peer connection with ${targetId}:`, err)
      })

      peer.on('signal', (offer) => {
         console.log('createPeerConnection: signaling offer:', offer) // Add this line
         const message = {
            type: SIGNAL_OFFER,
            payload: { targetId, offer },
         }
         socket.send(encode(message))
      })

      peer.on('connect', () => {
         console.log(`Connected to ${targetId}`)
      })

      peer.on('stream', (stream) => {
         const audio = new Audio()
         audio.srcObject = stream
         audio.play()
      })

      peer.on('close', () => {
         console.log(`Disconnected from ${targetId}`)
      })

      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
         peer.addStream(stream)
      })

      peersRef.current[targetId] = peer
   }

   function handleMessageSignal(event) {
      const message = decode(event.data) as WebSocketMessage
      //   console.log('Received message:', message) // Add this line
      switch (message.type) {
         case SIGNAL_OFFER:
            handleSignalOffer(message)
            break
         case SIGNAL_ANSWER:
            handleSignalAnswer(message)
            break
         case SIGNAL_ICE_CANDIDATE:
            handleSignalIceCandidate(message)
            break
      }
   }

   function handleSignalOffer(message) {
      console.log('Received signal_offer') // Add this line
      const { senderId, offer } = message.payload
      const peer = new SimplePeer({ initiator: false, trickle: false })

      peer.on('error', (err) => {
         console.error(`Error in peer connection with ${senderId}:`, err)
      })

      peer.on('signal', (answer) => {
         console.log('handleSignalOffer: signaling answer:', answer) // Add this line
         const message = {
            type: SIGNAL_ANSWER,
            payload: { targetId: senderId, answer },
         }
         socket.send(encode(message))
      })

      peer.on('connect', () => {
         console.log(`Connected to ${senderId}`)
      })

      peer.on('stream', (stream) => {
         const audio = new Audio()
         audio.srcObject = stream
         audio.play()
      })

      peer.on('close', () => {
         console.log(`Disconnected from ${senderId}`)
      })

      navigator.mediaDevices
         .getUserMedia({ audio: true })
         .then((stream) => {
            peer.addStream(stream)
         })
         .catch((error) => {
            console.error('Error getting user media:', error)
         })

      peer.signal(offer)
      peersRef.current[senderId] = peer
   }

   function handleSignalAnswer(message) {
      console.log('Handling signal_answer')
      const { senderId, answer } = message.payload
      const peer = peersRef.current[senderId]

      if (peer) {
         peer.signal(answer)
      }
   }

   function handleSignalIceCandidate(message) {
      const { senderId, candidate } = message.payload
      const peer = peersRef.current[senderId]

      if (peer) {
         peer.signal(candidate)
      }
   }
}

export default useWebRTC
