import { create } from 'zustand'
import { Euler, Vector3 } from 'three'

export interface PlayerSnapshotData {
   position: number[]
   rotation: number[]
   action?: string
   userName?: string
   microphone?: boolean
}

export interface PlayerPositionUpdate extends PlayerSnapshotData {
   id: string
   seq?: number
   serverTime?: number
}

export interface RemotePlayerPosition {
   id: string
   targetPosition: Vector3
   targetRotation: Euler
   action?: string
   userName?: string
   microphone?: boolean
   showSpawnEffect: boolean
   seq: number
   serverTime: number
}

export interface PlayerPositionsStore {
   playerPositions: Map<string, RemotePlayerPosition>
   updatePlayerPositions: (updatedClients: Record<string, PlayerSnapshotData>, localClientId: string) => void
   updatePlayerDeltas: (updatedClients: PlayerPositionUpdate[], localClientId: string) => void
   removeDisconnectedPlayer: (clientId: string) => void
}

function playerMetadataChanged(current: RemotePlayerPosition, next: PlayerSnapshotData) {
   return (
      (next.action !== undefined && current.action !== next.action) ||
      (next.userName !== undefined && current.userName !== next.userName) ||
      (next.microphone !== undefined && current.microphone !== next.microphone)
   )
}

function updateTargetTransform(player: RemotePlayerPosition, next: PlayerSnapshotData) {
   if (next.position?.length >= 3) {
      player.targetPosition.set(next.position[0], next.position[1], next.position[2])
   }

   if (next.rotation?.length >= 3) {
      player.targetRotation.set(0, next.rotation[1], 0)
   }
}

function createRemotePlayer(
   clientId: string,
   data: PlayerSnapshotData,
   seq = 0,
   serverTime = Date.now(),
   showSpawnEffect = false
) {
   return {
      id: clientId,
      targetPosition: new Vector3(data.position?.[0] ?? 0, data.position?.[1] ?? 0, data.position?.[2] ?? 0),
      targetRotation: new Euler(0, data.rotation?.[1] ?? 0, 0),
      action: data.action,
      userName: data.userName,
      microphone: data.microphone,
      showSpawnEffect,
      seq,
      serverTime,
   }
}

function updateRemotePlayer(
   player: RemotePlayerPosition,
   data: PlayerSnapshotData,
   seq = player.seq,
   serverTime = player.serverTime
) {
   const shouldPublish = playerMetadataChanged(player, data)

   updateTargetTransform(player, data)
   if (data.action !== undefined) {
      player.action = data.action
   }

   if (data.userName !== undefined) {
      player.userName = data.userName
   }

   if (data.microphone !== undefined) {
      player.microphone = data.microphone
   }
   player.seq = seq
   player.serverTime = serverTime

   return shouldPublish
}

export const usePlayerPositionsStore = create<PlayerPositionsStore>()((set, get) => ({
   playerPositions: new Map(),
   removeDisconnectedPlayer: (disconnectedClientId) => {
      const playerPositions = get().playerPositions
      if (!playerPositions.has(disconnectedClientId)) {
         return
      }

      const nextPlayerPositions = new Map(playerPositions)
      nextPlayerPositions.delete(disconnectedClientId)
      set({ playerPositions: nextPlayerPositions })
   },
   updatePlayerPositions: (updatedClients, localClientId) => {
      const playerPositions = get().playerPositions
      const snapshotClientIds = new Set<string>()
      let shouldPublish = false

      for (const clientId in updatedClients) {
         if (clientId === localClientId) {
            continue
         }

         snapshotClientIds.add(clientId)
         const nextClientData = updatedClients[clientId]
         const currentClientData = playerPositions.get(clientId)

         if (currentClientData) {
            shouldPublish = updateRemotePlayer(currentClientData, nextClientData) || shouldPublish
         } else {
            playerPositions.set(clientId, createRemotePlayer(clientId, nextClientData))
            shouldPublish = true
         }
      }

      for (const clientId of playerPositions.keys()) {
         if (!snapshotClientIds.has(clientId)) {
            playerPositions.delete(clientId)
            shouldPublish = true
         }
      }

      if (shouldPublish) {
         set({ playerPositions: new Map(playerPositions) })
      }
   },
   updatePlayerDeltas: (updatedClients, localClientId) => {
      const playerPositions = get().playerPositions
      let shouldPublish = false

      for (const nextClientData of updatedClients) {
         const clientId = nextClientData.id
         if (!clientId || clientId === localClientId) {
            continue
         }

         const currentClientData = playerPositions.get(clientId)
         const seq = nextClientData.seq ?? 0
         const serverTime = nextClientData.serverTime ?? Date.now()

         if (currentClientData) {
            if (seq > 0 && seq <= currentClientData.seq) {
               continue
            }

            shouldPublish = updateRemotePlayer(currentClientData, nextClientData, seq, serverTime) || shouldPublish
         } else {
            playerPositions.set(clientId, createRemotePlayer(clientId, nextClientData, seq, serverTime, true))
            shouldPublish = true
         }
      }

      if (shouldPublish) {
         set({ playerPositions: new Map(playerPositions) })
      }
   },
}))
