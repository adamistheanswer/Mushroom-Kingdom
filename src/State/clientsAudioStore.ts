// State/clientsStore.ts
import { create } from 'zustand'

type ClientData = {
   microphone: boolean
}

type ClientsStore = {
   clients: { [key: string]: ClientData }
   removeClient: (clientId: string) => void
   setClients: (activeClients: { [key: string]: ClientData }) => void
   updateVoiceChatStatus: (clientId: string, microphone: boolean) => void
}

export const useClientAudioStore = create<ClientsStore>((set, get) => ({
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
   updateVoiceChatStatus: (clientId, microphone) => {
      set((state) => {
         const updatedClients = { ...state.clients }
         if (updatedClients[clientId]) {
            updatedClients[clientId].microphone = microphone
         }
         return { clients: updatedClients }
      })
   },
}))

export default useClientAudioStore
