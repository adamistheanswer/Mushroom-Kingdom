import React, { useState, useEffect, CSSProperties } from 'react'
import useUserStore from '../State/userStore'
import useClientAudioStore from '../State/clientsAudioStore'
import { WebSocketMessage } from '../Interfaces/websockets'
import { decode, encode } from '@msgpack/msgpack'
import { useVoiceChat } from '../Utils/useVoiceChat'

const containerStyle: CSSProperties = {
   position: 'fixed',
   right: '20px',
   top: '20px',
}

const buttonStyle = {
   backgroundColor: 'rgba(0, 50, 0, 0.5)',
   border: '2px solid darkgreen',
   borderRadius: '50%',
   color: 'white',
   cursor: 'pointer',
   fontSize: '16px',
   padding: '0',
   width: '50px',
   height: '50px',
   display: 'flex',
   alignItems: 'center',
   justifyContent: 'center',
   transition: '0.3s',
}

const pulseAnimation = {
   animation: 'pulse 1s infinite alternate',
}

export function PlayerAudioConnection({ socket }) {
   const [voiceChatEnabled, setVoiceChatEnabled] = useState(false)
   const localClientId = useUserStore((state) => state.localClientId)
   const removeClient = useClientAudioStore((state) => state.removeClient)
   const setClients = useClientAudioStore((state) => state.setClients)
   const updateVoiceChatStatus = useClientAudioStore((state) => state.updateVoiceChatStatus)
   const { startVoiceChat } = useVoiceChat(socket, localClientId)

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
            setClients(message.payload)
            break
         case 'clientDisconnect':
            removeClient(message.payload)
            break
         case 'voiceChatStatusUpdate':
            const { clientId, voiceChatEnabled } = message.payload
            updateVoiceChatStatus(clientId, voiceChatEnabled)
            break
      }
   }

   function toggleVoiceChat() {
      startVoiceChat()
      setVoiceChatEnabled((prevEnabled) => {
         const newEnabled = !prevEnabled
         sendVoiceChatStatus(newEnabled)
         return newEnabled
      })
   }

   function sendVoiceChatStatus(enabled) {
      const message: WebSocketMessage = {
         type: 'state_set_client_voice_chat_status',
         payload: {
            clientId: localClientId,
            voiceChatEnabled: enabled,
         },
      }
      socket.send(encode(message))
   }

   return (
      <div style={containerStyle}>
         <button
            onClick={toggleVoiceChat}
            style={{
               ...buttonStyle,
               ...(voiceChatEnabled ? pulseAnimation : {}),
            }}
         >
            {voiceChatEnabled ? '🔴' : '🎤'}
         </button>
      </div>
   )
}
