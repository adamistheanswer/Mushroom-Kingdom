// State/clientsStore.ts
import { create } from 'zustand'

type ClientData = {
   microphone: boolean
   speaking?: boolean
}

type ClientsStore = {
   clients: { [key: string]: ClientData }
   removeClient: (clientId: string) => void
   setClients: (activeClients: { [key: string]: ClientData }) => void
   updateClientsFromDeltas: (clientDeltas: Array<{ id: string; microphone?: boolean }>) => void
   updateVoiceChatStatus: (clientId: string, microphone: boolean) => void
   updateClientSpeakingStatus: (clientId: string, speaking: boolean) => void
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
      set((state) => {
         const clients = {}

         for (const clientId in activeClients) {
            clients[clientId] = {
               ...activeClients[clientId],
               speaking: state.clients[clientId]?.speaking ?? false,
            }
         }

         return { clients }
      })
   },
   updateClientsFromDeltas: (clientDeltas) => {
      set((state) => {
         const updatedClients = { ...state.clients }

         for (const client of clientDeltas) {
            if (!client.id || client.microphone === undefined) {
               continue
            }

            updatedClients[client.id] = {
               ...updatedClients[client.id],
               microphone: client.microphone,
               speaking: client.microphone ? updatedClients[client.id]?.speaking : false,
            }
         }

         return { clients: updatedClients }
      })
   },
   updateVoiceChatStatus: (clientId, microphone) => {
      set((state) => {
         const updatedClients = { ...state.clients }
         updatedClients[clientId] = {
            ...updatedClients[clientId],
            microphone,
            speaking: microphone ? updatedClients[clientId]?.speaking : false,
         }
         return { clients: updatedClients }
      })
   },
   updateClientSpeakingStatus: (clientId, speaking) => {
      set((state) => {
         const currentClient = state.clients[clientId]
         if (currentClient?.speaking === speaking) {
            return state
         }

         const updatedClients = { ...state.clients }
         updatedClients[clientId] = {
            ...updatedClients[clientId],
            microphone: updatedClients[clientId]?.microphone ?? true,
            speaking,
         }
         return { clients: updatedClients }
      })
   },
}))

export default useClientAudioStore
