// State/clientsStore.ts
import { create } from 'zustand'

type ClientData = {
   voiceChatEnabled: boolean
}

type ClientsStore = {
   clients: { [key: string]: ClientData }
   removeClient: (clientId: string) => void
   setClients: (activeClients: { [key: string]: ClientData }) => void
   updateVoiceChatStatus: (clientId: string, voiceChatEnabled: boolean) => void
}

export const useClientsStore = create<ClientsStore>((set, get) => ({
   clients: {},
   removeClient: (clientId) => {
      set((state) => {
         const newClients = { ...state.clients }
         delete newClients[clientId]
         return { clients: newClients }
      })
   },
   setClients: (activeClients) => {
      set({ clients: { ...activeClients } })
   },
   updateVoiceChatStatus: (clientId, voiceChatEnabled) => {
      set((state) => {
         const updatedClients = { ...state.clients }
         if (updatedClients[clientId]) {
            updatedClients[clientId].voiceChatEnabled = voiceChatEnabled
         }
         return { clients: updatedClients }
      })
   },
}))

export default useClientsStore
