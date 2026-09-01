import { create } from 'zustand'

export const CHAT_BUBBLE_DURATION_MS = 20000
export const CHAT_BUBBLE_FADE_MS = 4000
const CHAT_HISTORY_LIMIT = 50

export interface ChatMessage {
   id: string
   clientId: string
   userName: string
   text: string
   createdAt: number
   disconnected?: boolean
}

interface ChatStore {
   messages: ChatMessage[]
   latestMessagesByClientId: Record<string, ChatMessage | undefined>
   visibleChatMessagesByClientId: Record<string, ChatMessage | undefined>
   chatBubbleNow: number
   setMessages: (messages: ChatMessage[]) => void
   addMessage: (message: ChatMessage) => void
   markClientDisconnected: (clientId: string) => void
   setChatBubbleNow: (now: number) => void
   clearMessages: () => void
}

function sortMessages(messages: ChatMessage[]) {
   return [...messages].sort((a, b) => a.createdAt - b.createdAt).slice(-CHAT_HISTORY_LIMIT)
}

function buildLatestMessagesByClientId(messages: ChatMessage[]) {
   const latestMessagesByClientId: Record<string, ChatMessage | undefined> = {}

   for (const message of messages) {
      latestMessagesByClientId[message.clientId] = message
   }

   return latestMessagesByClientId
}

function buildVisibleChatMessagesByClientId(
   latestMessagesByClientId: Record<string, ChatMessage | undefined>,
   now: number
) {
   const visibleChatMessagesByClientId: Record<string, ChatMessage | undefined> = {}
   const cutoff = now - CHAT_BUBBLE_DURATION_MS

   for (const clientId in latestMessagesByClientId) {
      const message = latestMessagesByClientId[clientId]

      if (message && message.createdAt >= cutoff) {
         visibleChatMessagesByClientId[clientId] = message
      }
   }

   return visibleChatMessagesByClientId
}

export const useChatStore = create<ChatStore>((set, get) => {
   let pendingMessages: ChatMessage[] = []
   let flushHandle: number | null = null

   const flushPendingMessages = () => {
      flushHandle = null

      if (pendingMessages.length === 0) {
         return
      }

      const nextMessages = pendingMessages
      pendingMessages = []

      set((state) => {
         const messages = sortMessages([...state.messages, ...nextMessages])
         const latestMessagesByClientId = { ...state.latestMessagesByClientId }

         for (const message of nextMessages) {
            latestMessagesByClientId[message.clientId] = message
         }

         return {
            messages,
            latestMessagesByClientId,
            visibleChatMessagesByClientId: buildVisibleChatMessagesByClientId(
               latestMessagesByClientId,
               state.chatBubbleNow
            ),
         }
      })
   }

   const scheduleFlush = () => {
      if (flushHandle !== null) {
         return
      }

      flushHandle = window.requestAnimationFrame
         ? window.requestAnimationFrame(flushPendingMessages)
         : window.setTimeout(flushPendingMessages, 0)
   }

   return {
   messages: [],
   latestMessagesByClientId: {},
   visibleChatMessagesByClientId: {},
   chatBubbleNow: Date.now(),
   setMessages: (messages) => set((state) => {
      const sortedMessages = sortMessages(messages)
      const latestMessagesByClientId = buildLatestMessagesByClientId(sortedMessages)

      return {
         messages: sortedMessages,
         latestMessagesByClientId,
         visibleChatMessagesByClientId: buildVisibleChatMessagesByClientId(
            latestMessagesByClientId,
            state.chatBubbleNow
         ),
      }
   }),
   addMessage: (message) =>
      {
         const state = get()
         const alreadyQueued = pendingMessages.some((currentMessage) => currentMessage.id === message.id)
         const alreadyStored = state.messages.some((currentMessage) => currentMessage.id === message.id)

         if (alreadyQueued || alreadyStored) {
            return
         }

         pendingMessages.push(message)
         scheduleFlush()
      },
   markClientDisconnected: (clientId) =>
      set((state) => {
         const messages = state.messages.map((message) =>
            message.clientId === clientId ? { ...message, disconnected: true } : message
         )
         const latestMessagesByClientId = buildLatestMessagesByClientId(messages)

         return {
            messages,
            latestMessagesByClientId,
            visibleChatMessagesByClientId: buildVisibleChatMessagesByClientId(
               latestMessagesByClientId,
               state.chatBubbleNow
            ),
         }
      }),
   setChatBubbleNow: (chatBubbleNow) =>
      set((state) => ({
         chatBubbleNow,
         visibleChatMessagesByClientId: buildVisibleChatMessagesByClientId(
            state.latestMessagesByClientId,
            chatBubbleNow
         ),
      })),
   clearMessages: () => {
      pendingMessages = []
      set({ messages: [], latestMessagesByClientId: {}, visibleChatMessagesByClientId: {} })
   },
   }
})
