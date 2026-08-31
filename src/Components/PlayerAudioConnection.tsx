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
   const updateClientsFromDeltas = useClientAudioStore((state) => state.updateClientsFromDeltas)
   const updateVoiceChatStatus = useClientAudioStore((state) => state.updateVoiceChatStatus)
   const { startVoiceChat, stopVoiceChat } = useVoiceChat(socket, localClientId)

   useEffect(() => {
      socket.addEventListener('message', handleMessage)
      return () => {
         socket.removeEventListener('message', handleMessage)
      }
   }, [removeClient, setClients, socket, updateClientsFromDeltas, updateVoiceChatStatus])

   function handleMessage(event) {
      const message = decode(event.data) as WebSocketMessage

      switch (message.type) {
         case 'activeClients':
            setClients(message.payload)
            break
         case 'clientUpdates':
            if (Array.isArray(message.payload)) {
               updateClientsFromDeltas(message.payload)
            }
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

   async function toggleVoiceChat() {
      if (voiceChatEnabled) {
         stopVoiceChat()
         updateVoiceChatStatus(localClientId, false)
         sendVoiceChatStatus(false)
         setVoiceChatEnabled(false)
         return
      }

      if (!localClientId || socket.readyState !== WebSocket.OPEN) {
         return
      }

      try {
         await startVoiceChat()
         updateVoiceChatStatus(localClientId, true)
         sendVoiceChatStatus(true)
         setVoiceChatEnabled(true)
      } catch {
         updateVoiceChatStatus(localClientId, false)
         sendVoiceChatStatus(false)
         setVoiceChatEnabled(false)
      }
   }

   function sendVoiceChatStatus(enabled) {
      if (!localClientId || socket.readyState !== WebSocket.OPEN) {
         return
      }

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
