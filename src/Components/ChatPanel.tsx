import React, { FormEvent, useEffect, useRef, useState } from 'react'
import { encode } from '@msgpack/msgpack'
import { useChatStore } from '../State/chatStore'
import { useIsMobile } from '../Utils/useIsMobile'
import { useKeyboardInset } from '../Utils/useKeyboardInset'

interface ChatPanelProps {
   socket: WebSocket
}

const MAX_CHAT_LENGTH = 160

function formatMessageTime(timestamp: number) {
   return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
   }).format(new Date(timestamp))
}

const ChatPanel: React.FC<ChatPanelProps> = ({ socket }) => {
   const [messageText, setMessageText] = useState('')
   const [logOpen, setLogOpen] = useState(false)
   const [unreadCount, setUnreadCount] = useState(0)
   const messages = useChatStore((state) => state.messages)
   const messagesRef = useRef<HTMLDivElement>(null)
   const lastSeenIdRef = useRef<string | null>(null)
   const isMobile = useIsMobile()

   useKeyboardInset()

   // On desktop the log is always on screen, on mobile it lives behind the bottom left toggle.
   const logVisible = !isMobile || logOpen

   useEffect(() => {
      if (logVisible) {
         lastSeenIdRef.current = messages[messages.length - 1]?.id ?? null
         setUnreadCount(0)
         messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight })
         return
      }

      const lastSeenIndex = messages.findIndex((message) => message.id === lastSeenIdRef.current)
      setUnreadCount(lastSeenIndex === -1 ? messages.length : messages.length - lastSeenIndex - 1)
   }, [messages, logVisible])

   const sendMessage = (event: FormEvent) => {
      event.preventDefault()
      const text = messageText.trim()

      if (!text || socket.readyState !== WebSocket.OPEN) {
         return
      }

      socket.send(
         encode({
            type: 'chat',
            payload: { text },
         })
      )
      setMessageText('')
   }

   return (
      <section className="chat-panel" aria-label="Room chat">
         <div
            id="chat-panel-log"
            className={`chat-panel__log${logOpen ? ' chat-panel__log--open' : ''}`}
            aria-hidden={!logVisible}
         >
            <div className="chat-panel__log-header">
               <span className="chat-panel__log-title">Room messages</span>
               <button
                  className="chat-panel__log-close"
                  type="button"
                  onClick={() => setLogOpen(false)}
                  aria-label="Hide room messages"
               >
                  ✕
               </button>
            </div>
            <div ref={messagesRef} className="chat-panel__messages">
               {messages.length === 0 ? (
                  <p className="chat-panel__empty">No messages yet — say hello!</p>
               ) : (
                  messages.map((message) => (
                     <div key={message.id} className="chat-panel__message">
                        <span className="chat-panel__time">{formatMessageTime(message.createdAt)}</span>
                        <span className="chat-panel__name">
                           {message.userName || message.clientId}
                           {message.disconnected && <span className="chat-panel__status">offline</span>}
                        </span>
                        <span className="chat-panel__text">{message.text}</span>
                     </div>
                  ))
               )}
            </div>
         </div>
         <button
            className="chat-panel__toggle"
            type="button"
            onClick={() => setLogOpen((open) => !open)}
            aria-expanded={logOpen}
            aria-controls="chat-panel-log"
            aria-label={logOpen ? 'Hide room messages' : 'Show room messages'}
         >
            <span aria-hidden="true">{logOpen ? '✕' : '💬'}</span>
            {!logOpen && unreadCount > 0 && (
               <span className="chat-panel__badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
         </button>
         <form className="chat-panel__form" onSubmit={sendMessage}>
            <input
               className="chat-panel__input"
               type="text"
               value={messageText}
               onChange={(event) => setMessageText(event.target.value.slice(0, MAX_CHAT_LENGTH))}
               placeholder="Message The Kingdom"
               aria-label="Message The Kingdom"
               maxLength={MAX_CHAT_LENGTH}
               autoComplete="off"
               enterKeyHint="send"
            />
            <button className="chat-panel__send" type="submit" disabled={!messageText.trim()}>
               Send
            </button>
         </form>
      </section>
   )
}

export default ChatPanel
