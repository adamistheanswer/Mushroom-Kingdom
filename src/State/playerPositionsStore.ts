// import { create } from 'zustand'

// export interface PlayerPosition {
//    position: { x: number; y: number; z: number }
//    rotation: { x: number; y: number; z: number }
// }

// export const usePlayerPositionsStore = create<{
//    playerPositions: Map<string, PlayerPosition>
//    updatePlayerPositions: (updatedClients: any, localClientId: string) => void
//    removeDisconnectedPlayer: (disconnectedClientId: string) => void
// }>((set, get) => ({
//    playerPositions: new Map(),
//    removeDisconnectedPlayer: (disconnectedClientId) => {
//       set((state) => {
//          const newPositions = new Map(state.playerPositions)
//          newPositions.delete(disconnectedClientId)
//          return { playerPositions: newPositions }
//       })
//    },
//    updatePlayerPositions: (updatedClients, localClientId) => {
//       set((state) => {
//          const newPositions = new Map(state.playerPositions)
//          let hasChanged = false

//          for (const clientId in updatedClients) {
//             if (clientId !== localClientId) {
//                const { position, rotation } = updatedClients[clientId]
//                const currentPosition = state.playerPositions.get(clientId)
//                if (!currentPosition || JSON.stringify(currentPosition) !== JSON.stringify({ position, rotation })) {
//                   newPositions.set(clientId, { position, rotation })
//                   hasChanged = true
//                }
//             }
//          }

//          if (!hasChanged) {
//             return state
//          }

//          return { playerPositions: newPositions }
//       })
//    },
// }))

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'

export interface PlayerPosition {
   position: { x: number; y: number; z: number }
   rotation: { x: number; y: number; z: number }
}

export interface PlayerPositionsStore {
   playerPositions: Map<string, PlayerPosition>
   updatePlayerPositions: (updatedClients: Record<string, PlayerPosition>, localClientId: string) => void
   removeDisconnectedPlayer: (clientId: string) => void
   updateSinglePlayerPosition: (
      clientId: string,
      position: { x: number; y: number; z: number },
      rotation: { x: number; y: number; z: number }
   ) => void
}

enableMapSet()

export const usePlayerPositionsStore = create<PlayerPositionsStore>()(
   immer((set) => ({
      playerPositions: new Map(),
      removeDisconnectedPlayer: (disconnectedClientId) => {
         set((state) => {
            state.playerPositions.delete(disconnectedClientId)
         })
      },
      updateSinglePlayerPosition: (clientId, position, rotation) => {
         set((state) => {
            state.playerPositions.set(clientId, { position, rotation })
         })
      },
      updatePlayerPositions: (updatedClients, localClientId) => {
         set((state) => {
            for (const clientId in updatedClients) {
               if (clientId !== localClientId) {
                  const { position, rotation } = updatedClients[clientId]
                  state.playerPositions.set(clientId, { position, rotation })
               }
            }
         })
      },
   }))
)
