import { getClient } from '../clients/clientState.js'
import { broadcastMessage } from '../websockets/messages.js'

// The log is deliberately small and in-memory: it exists so somebody arriving mid-conversation has
// context, not as a record. It goes when the room empties.
const CHAT_HISTORY_LIMIT = 50
const CHAT_MESSAGE_MAX_LENGTH = 160

const chatMessages = []
let chatMessageSequence = 0

function normaliseChatText(text) {
   if (typeof text !== 'string') {
      return ''
   }

   return text.replace(/\s+/g, ' ').trim().slice(0, CHAT_MESSAGE_MAX_LENGTH)
}

function addChatMessage(clientId, clientData, text) {
   const normalisedText = normaliseChatText(text)

   if (!normalisedText) {
      return null
   }

   const message = {
      // A timestamp alone collides when two messages land in the same millisecond.
      id: `${Date.now()}-${++chatMessageSequence}`,
      clientId,
      userName: clientData?.userName || clientId,
      text: normalisedText,
      createdAt: Date.now(),
      disconnected: false,
   }

   chatMessages.push(message)

   if (chatMessages.length > CHAT_HISTORY_LIMIT) {
      chatMessages.splice(0, chatMessages.length - CHAT_HISTORY_LIMIT)
   }

   return message
}

export function getChatMessages() {
   return chatMessages
}

/** Their words stay in the log, but render as a departed player rather than someone still here. */
export function markChatMessagesDisconnected(clientId) {
   for (const message of chatMessages) {
      if (message.clientId === clientId) {
         message.disconnected = true
      }
   }
}

export function clearChatHistory() {
   chatMessages.length = 0
}

export function handleChatMessage(clientId, message) {
   const clientData = getClient(clientId)

   if (!clientData) {
      return
   }

   const chatMessage = addChatMessage(clientId, clientData, message.payload?.text)

   if (!chatMessage) {
      return
   }

   broadcastMessage('chatMessage', chatMessage)
}
