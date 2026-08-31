import React, { useEffect, useRef } from 'react'
import { Avatar } from './Avatar'
import useUserStore from '../State/userStore'
import { Euler, Group, Vector3 } from 'three'
import { NamePlate } from './NamePlate'
import { decode } from '@msgpack/msgpack'
import { useFrame } from '@react-three/fiber'
import {
   PlayerPositionUpdate,
   PlayerSnapshotData,
   RemotePlayerPosition,
   usePlayerPositionsStore,
} from '../State/playerPositionsStore'
import useClientAudioStore from '../State/clientsAudioStore'

interface WebSocketMessage {
   type: string
   payload: any
}

const REMOTE_CHILD_POSITION = new Vector3(0, 0, 0)
const REMOTE_CHILD_ROTATION = new Euler(0, 0, 0)
const POSITION_LERP_RATE = 16

const RemotePlayer = React.memo(
   ({
      clientSocket,
      player,
      action,
      userName,
      microphone,
      speaking,
   }: {
      clientSocket: WebSocket
      player: RemotePlayerPosition
      action?: string
      userName?: string
      microphone?: boolean
      speaking?: boolean
   }) => {
      const positionGroupRef = useRef<Group>(null!)
      const rotationGroupRef = useRef<Group>(null!)

      useEffect(() => {
         positionGroupRef.current.position.copy(player.targetPosition)
         rotationGroupRef.current.rotation.set(0, player.targetRotation.y, 0)
      }, [player])

      useFrame((_, delta) => {
         const positionGroup = positionGroupRef.current
         const rotationGroup = rotationGroupRef.current

         if (!positionGroup || !rotationGroup) {
            return
         }

         positionGroup.position.lerp(player.targetPosition, 1 - Math.exp(-POSITION_LERP_RATE * delta))
         rotationGroup.rotation.x = 0
         rotationGroup.rotation.y = player.targetRotation.y
         rotationGroup.rotation.z = 0
      })

      return (
         <group ref={positionGroupRef}>
            <NamePlate
               position={REMOTE_CHILD_POSITION}
               clientId={player.id}
               socket={clientSocket}
               isLocal={false}
               userName={userName}
               microphone={microphone}
               speaking={speaking}
            />
            <group ref={rotationGroupRef}>
               <Avatar
                  position={REMOTE_CHILD_POSITION}
                  rotation={REMOTE_CHILD_ROTATION}
                  action={action}
                  clientId={player.id}
                  clientSocket={clientSocket}
               />
            </group>
         </group>
      )
   }
)

const RemotePlayers = ({ clientSocket }) => {
   const localClientId = useUserStore((state) => state.localClientId)
   const playerPositions = usePlayerPositionsStore((state) => state.playerPositions)
   const updatePlayerPositions = usePlayerPositionsStore((state) => state.updatePlayerPositions)
   const updatePlayerDeltas = usePlayerPositionsStore((state) => state.updatePlayerDeltas)
   const removeDisconnectedPlayer = usePlayerPositionsStore((state) => state.removeDisconnectedPlayer)
   const audioClients = useClientAudioStore((state) => state.clients)
   const pendingActiveClientsRef = useRef<Record<string, PlayerSnapshotData> | null>(null)
   const pendingDeltasRef = useRef<PlayerPositionUpdate[]>([])

   useEffect(() => {
      if (!localClientId) {
         return
      }

      if (pendingActiveClientsRef.current) {
         updatePlayerPositions(pendingActiveClientsRef.current, localClientId)
         pendingActiveClientsRef.current = null
      }

      if (pendingDeltasRef.current.length > 0) {
         updatePlayerDeltas(pendingDeltasRef.current, localClientId)
         pendingDeltasRef.current = []
      }
   }, [localClientId, updatePlayerDeltas, updatePlayerPositions])

   useEffect(() => {
      const handleClientUpdates = (event) => {
         const message = decode(event.data) as WebSocketMessage
         switch (message.type) {
            case 'activeClients':
               if (localClientId) {
                  updatePlayerPositions(message.payload, localClientId)
               } else {
                  pendingActiveClientsRef.current = message.payload
               }
               break
            case 'clientUpdates':
               if (Array.isArray(message.payload)) {
                  if (localClientId) {
                     updatePlayerDeltas(message.payload, localClientId)
                  } else {
                     pendingDeltasRef.current.push(...message.payload)
                  }
               } else {
                  if (localClientId) {
                     updatePlayerPositions(message.payload, localClientId)
                  } else {
                     pendingActiveClientsRef.current = message.payload
                  }
               }
               break
            case 'clientDisconnect':
               removeDisconnectedPlayer(message.payload)
               break
         }
      }

      if (clientSocket) {
         clientSocket.addEventListener('message', handleClientUpdates)
      }

      return () => {
         if (clientSocket) {
            clientSocket.removeEventListener('message', handleClientUpdates)
         }
      }
   }, [clientSocket, localClientId, removeDisconnectedPlayer, updatePlayerDeltas, updatePlayerPositions])

   const remotePlayerModels = Array.from(playerPositions.entries()).map(([clientId, data]) => (
      <RemotePlayer
         key={clientId}
         player={data}
         action={data.action}
         userName={data.userName}
         microphone={audioClients[clientId]?.microphone ?? data.microphone}
         speaking={audioClients[clientId]?.speaking}
         clientSocket={clientSocket}
      />
   ))

   return <>{remotePlayerModels}</>
}

export default RemotePlayers
