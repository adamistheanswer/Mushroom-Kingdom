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
   setMessages: (messages: ChatMessage[]) => void
   addMessage: (message: ChatMessage) => void
   markClientDisconnected: (clientId: string) => void
   clearMessages: () => void
}

function sortMessages(messages: ChatMessage[]) {
   return [...messages].sort((a, b) => a.createdAt - b.createdAt).slice(-CHAT_HISTORY_LIMIT)
}

export const useChatStore = create<ChatStore>((set) => ({
   messages: [],
   setMessages: (messages) => set({ messages: sortMessages(messages) }),
   addMessage: (message) =>
      set((state) => {
         if (state.messages.some((currentMessage) => currentMessage.id === message.id)) {
            return state
         }

         return { messages: sortMessages([...state.messages, message]) }
      }),
   markClientDisconnected: (clientId) =>
      set((state) => ({
         messages: state.messages.map((message) =>
            message.clientId === clientId ? { ...message, disconnected: true } : message
         ),
      })),
   clearMessages: () => set({ messages: [] }),
}))
