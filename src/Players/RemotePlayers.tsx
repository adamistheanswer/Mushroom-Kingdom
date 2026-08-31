import React, { useEffect, useRef } from 'react'
import { Avatar } from './Avatar'
import useUserStore from '../State/userStore'
import { Euler, Group, MathUtils, Vector3 } from 'three'
import { NamePlate } from './NamePlate'
import { decode } from '@msgpack/msgpack'
import { useFrame } from '@react-three/fiber'
import {
   PlayerPositionUpdate,
   PlayerSnapshotData,
   RemotePlayerPosition,
   usePlayerPositionsStore,
} from '../State/playerPositionsStore'

interface WebSocketMessage {
   type: string
   payload: any
}

const REMOTE_CHILD_POSITION = new Vector3(0, 0, 0)
const REMOTE_CHILD_ROTATION = new Euler(0, 0, 0)
const POSITION_LERP_RATE = 16
const ROTATION_LERP_RATE = 20

function dampAngle(current: number, target: number, lambda: number, delta: number) {
   const shortestAngle = MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI
   return current + shortestAngle * (1 - Math.exp(-lambda * delta))
}

const RemotePlayer = React.memo(
   ({
      clientSocket,
      player,
      action,
      userName,
   }: {
      clientSocket: WebSocket
      player: RemotePlayerPosition
      action?: string
      userName?: string
   }) => {
      const positionGroupRef = useRef<Group>(null!)
      const rotationGroupRef = useRef<Group>(null!)

      useEffect(() => {
         positionGroupRef.current.position.copy(player.targetPosition)
         rotationGroupRef.current.rotation.copy(player.targetRotation)
      }, [player])

      useFrame((_, delta) => {
         const positionGroup = positionGroupRef.current
         const rotationGroup = rotationGroupRef.current

         if (!positionGroup || !rotationGroup) {
            return
         }

         positionGroup.position.lerp(player.targetPosition, 1 - Math.exp(-POSITION_LERP_RATE * delta))
         rotationGroup.rotation.x = MathUtils.damp(
            rotationGroup.rotation.x,
            player.targetRotation.x,
            ROTATION_LERP_RATE,
            delta
         )
         rotationGroup.rotation.y = dampAngle(
            rotationGroup.rotation.y,
            player.targetRotation.y,
            ROTATION_LERP_RATE,
            delta
         )
         rotationGroup.rotation.z = MathUtils.damp(
            rotationGroup.rotation.z,
            player.targetRotation.z,
            ROTATION_LERP_RATE,
            delta
         )
      })

      return (
         <group ref={positionGroupRef}>
            <NamePlate
               position={REMOTE_CHILD_POSITION}
               clientId={player.id}
               socket={clientSocket}
               isLocal={false}
               userName={userName}
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
         clientSocket={clientSocket}
      />
   ))

   return <>{remotePlayerModels}</>
}

export default RemotePlayers
