import React, { useState, useEffect } from 'react'
import useWebRTC from '../Utils/useWebRTC'
import useUserStore from '../State/userStore'
import useClientsStore from '../State/clientsStore' // Import the new store
import { WebSocketMessage } from '../Interfaces/websockets'
import { decode, encode } from '@msgpack/msgpack'

const containerStyle = {
   position: 'fixed',
   right: '20px',
   top: '20px',
}

export function PlayerAudioConnection({ socket }) {
   const [voiceChatEnabled, setVoiceChatEnabled] = useState(false)
   const localClientId = useUserStore((state) => state.localClientId)
   const clients = useClientsStore((state) => state.clients)
   const removeClient = useClientsStore((state) => state.removeClient)
   const setClients = useClientsStore((state) => state.setClients)
   const updateVoiceChatStatus = useClientsStore((state) => state.updateVoiceChatStatus)

   console.log('Player Audio Clients:', clients)

   useEffect(() => {
      socket.addEventListener('message', handleMessage)
      return () => {
         socket.removeEventListener('message', handleMessage)
      }
   }, [socket])

   function handleMessage(event) {
      const message = decode(event.data) as WebSocketMessage

      switch (message.type) {
         case 'activeClients':
            console.log('Active Client Payload', message.payload)
            setClients(message.payload)
            break
         case 'removeClient':
            console.log('Remove Client Payload', message.payload)
            removeClient(message.payload)
            break
         case 'voiceChatStatusUpdate':
            console.log('Chat Status Payload', message.payload)
            const { clientId, voiceChatEnabled } = message.payload
            updateVoiceChatStatus(clientId, voiceChatEnabled)
            break
      }
   }
   function toggleVoiceChat() {
      setVoiceChatEnabled((prevEnabled) => {
         const newEnabled = !prevEnabled
         sendVoiceChatStatus(newEnabled)
         return newEnabled
      })
   }

   function sendVoiceChatStatus(enabled) {
      const message: WebSocketMessage = {
         type: 'voice_chat_status_update',
         payload: {
            clientId: localClientId,
            voiceChatEnabled: enabled,
         },
      }
      socket.send(encode(message))
   }

   // useWebRTC(socket, localClientId, clients, voiceChatEnabled)

   return (
      <div style={containerStyle}>
         <button onClick={toggleVoiceChat}>{voiceChatEnabled ? 'Disable Voice Chat' : 'Enable Voice Chat'}</button>
      </div>
   )
}
