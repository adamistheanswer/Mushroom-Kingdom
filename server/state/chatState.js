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

export function addChatMessage(clientId, clientData, text) {
   const normalisedText = normaliseChatText(text)
   if (!normalisedText) {
      return null
   }

   const message = {
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

export function markChatMessagesDisconnected(clientId) {
   for (const message of chatMessages) {
      if (message.clientId === clientId) {
         message.disconnected = true
      }
   }
}

export function clearChatMessages() {
   chatMessages.length = 0
}
