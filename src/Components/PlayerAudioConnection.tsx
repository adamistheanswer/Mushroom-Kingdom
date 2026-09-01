import React, { useState, useEffect, useCallback, useRef, CSSProperties } from 'react'
import useUserStore from '../State/userStore'
import useClientAudioStore from '../State/clientsAudioStore'
import { WebSocketMessage } from '../Interfaces/websockets'
import { decode, encode } from '@msgpack/msgpack'
import { useVoiceChat } from '../Utils/useVoiceChat'

const containerStyle: CSSProperties = {
   position: 'fixed',
   right: '20px',
   top: '20px',
   display: 'flex',
   flexDirection: 'column',
   alignItems: 'flex-end',
   gap: '8px',
}

const buttonStyle: CSSProperties = {
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

const statusStyle: CSSProperties = {
   backgroundColor: 'rgba(0, 0, 0, 0.65)',
   border: '1px solid rgba(255, 255, 255, 0.2)',
   borderRadius: '6px',
   color: 'white',
   fontFamily: 'sans-serif',
   fontSize: '11px',
   lineHeight: 1.3,
   maxWidth: '200px',
   padding: '6px 8px',
   textAlign: 'right',
}

const pulseAnimation: CSSProperties = {
   animation: 'pulse 1s infinite alternate',
}

/**
 * Kept outside the component: the whole panel unmounts while the websocket reconnects, and the
 * player's intent to be in voice chat has to survive that.
 */
let voiceChatIntent = false
let voiceChatMutedIntent = false

export function PlayerAudioConnection({ socket }) {
   const [voiceChatEnabled, setVoiceChatEnabled] = useState(voiceChatIntent)
   const [busy, setBusy] = useState(false)
   const localClientId = useUserStore((state) => state.localClientId)
   const updateVoiceChatStatus = useClientAudioStore((state) => state.updateVoiceChatStatus)
   const {
      startVoiceChat,
      stopVoiceChat,
      handleVoiceMessage,
      retryBlockedAudio,
      setMuted,
      audioBlocked,
      muted,
      voiceError,
   } = useVoiceChat(socket, localClientId)
   const resumedForRef = useRef('')

   const sendVoiceChatStatus = useCallback(
      (enabled: boolean) => {
         if (!localClientId || socket.readyState !== WebSocket.OPEN) {
            return
         }

         const message: WebSocketMessage = {
            type: 'state_set_client_voice_chat_status',
            payload: { voiceChatEnabled: enabled },
         }
         socket.send(encode(message))
      },
      [localClientId, socket]
   )

   useEffect(() => {
      const handleMessage = (event) => {
         let message: WebSocketMessage

         try {
            message = decode(event.data) as WebSocketMessage
         } catch (error) {
            return
         }

         handleVoiceMessage(message)
      }

      socket.addEventListener('message', handleMessage)
      return () => {
         socket.removeEventListener('message', handleMessage)
      }
   }, [handleVoiceMessage, socket])

   const enableVoiceChat = useCallback(async () => {
      if (!localClientId || socket.readyState !== WebSocket.OPEN) {
         return
      }

      setBusy(true)

      try {
         await startVoiceChat()
         voiceChatIntent = true
         // Rejoining after a reconnect must not un-mute someone who chose to be muted.
         setMuted(voiceChatMutedIntent)
         updateVoiceChatStatus(localClientId, true)
         sendVoiceChatStatus(true)
         setVoiceChatEnabled(true)
      } catch (error) {
         voiceChatIntent = false
         updateVoiceChatStatus(localClientId, false)
         sendVoiceChatStatus(false)
         setVoiceChatEnabled(false)
      } finally {
         setBusy(false)
      }
   }, [localClientId, sendVoiceChatStatus, setMuted, socket, startVoiceChat, updateVoiceChatStatus])

   const toggleMuted = useCallback(() => {
      voiceChatMutedIntent = !muted
      setMuted(!muted)
   }, [muted, setMuted])

   const disableVoiceChat = useCallback(() => {
      voiceChatIntent = false
      voiceChatMutedIntent = false
      stopVoiceChat()
      updateVoiceChatStatus(localClientId, false)
      sendVoiceChatStatus(false)
      setVoiceChatEnabled(false)
   }, [localClientId, sendVoiceChatStatus, stopVoiceChat, updateVoiceChatStatus])

   // Rejoin voice automatically once a reconnect hands us a fresh client id.
   useEffect(() => {
      if (!voiceChatIntent || !localClientId || resumedForRef.current === localClientId) {
         return
      }

      resumedForRef.current = localClientId
      void enableVoiceChat()
   }, [enableVoiceChat, localClientId])

   function toggleVoiceChat() {
      if (busy) {
         return
      }

      if (voiceChatEnabled) {
         disableVoiceChat()
         return
      }

      void enableVoiceChat()
   }

   const label = voiceChatEnabled ? 'Leave voice chat' : 'Join voice chat'
   const muteLabel = muted ? 'Unmute microphone' : 'Mute microphone'

   return (
      <div style={containerStyle}>
         <button
            onClick={toggleVoiceChat}
            aria-label={label}
            title={label}
            aria-pressed={voiceChatEnabled}
            disabled={busy || !localClientId}
            style={{
               ...buttonStyle,
               cursor: busy || !localClientId ? 'progress' : 'pointer',
               opacity: busy || !localClientId ? 0.6 : 1,
               ...(voiceChatEnabled ? pulseAnimation : {}),
            }}
         >
            {voiceChatEnabled ? '🔴' : '🎤'}
         </button>

         {voiceChatEnabled && (
            <button
               onClick={toggleMuted}
               aria-label={muteLabel}
               title={muteLabel}
               aria-pressed={muted}
               style={{
                  ...buttonStyle,
                  backgroundColor: muted ? 'rgba(90, 0, 0, 0.65)' : 'rgba(0, 50, 0, 0.5)',
                  border: muted ? '2px solid darkred' : '2px solid darkgreen',
               }}
            >
               {muted ? '🚫' : '🎙️'}
            </button>
         )}

         {audioBlocked && (
            <button onClick={retryBlockedAudio} style={{ ...statusStyle, cursor: 'pointer' }}>
               Tap to enable voice audio
            </button>
         )}

         {voiceError && <div style={statusStyle}>{voiceError}</div>}
      </div>
   )
}
