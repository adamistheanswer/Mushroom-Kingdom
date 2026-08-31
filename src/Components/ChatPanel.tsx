import React, { FormEvent, useEffect, useRef, useState } from 'react'
import { encode } from '@msgpack/msgpack'
import { useChatStore } from '../State/chatStore'

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
   const messages = useChatStore((state) => state.messages)
   const messagesRef = useRef<HTMLDivElement>(null)

   useEffect(() => {
      messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight })
   }, [messages])

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
         <div ref={messagesRef} className="chat-panel__messages">
            {messages.map((message) => (
               <div key={message.id} className="chat-panel__message">
                  <span className="chat-panel__time">{formatMessageTime(message.createdAt)}</span>
                  <span className="chat-panel__name">
                     {message.userName || message.clientId}
                     {message.disconnected && <span className="chat-panel__status">offline</span>}
                  </span>
                  <span className="chat-panel__text">{message.text}</span>
               </div>
            ))}
         </div>
         <form className="chat-panel__form" onSubmit={sendMessage}>
            <input
               className="chat-panel__input"
               type="text"
               value={messageText}
               onChange={(event) => setMessageText(event.target.value.slice(0, MAX_CHAT_LENGTH))}
               placeholder="Message The Kingdom"
               maxLength={MAX_CHAT_LENGTH}
            />
            <button className="chat-panel__send" type="submit" disabled={!messageText.trim()}>
               Send
            </button>
         </form>
      </section>
   )
}

export default ChatPanel
