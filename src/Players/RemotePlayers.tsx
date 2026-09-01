import React, { useEffect, useMemo, useRef } from 'react'
import { Avatar } from './Avatar'
import { Euler, Group, Vector3 } from 'three'
import { NamePlate } from './NamePlate'
import { useFrame } from '@react-three/fiber'
import { RemotePlayerPosition, usePlayerPositionsStore } from '../State/playerPositionsStore'
import useClientAudioStore from '../State/clientsAudioStore'
import SpawnEffect from './SpawnEffect'

const REMOTE_CHILD_POSITION = new Vector3(0, 0, 0)
const REMOTE_CHILD_ROTATION = new Euler(0, 0, 0)
const POSITION_LERP_RATE = 16

const RemotePlayer = React.memo(
   ({
      player,
      action,
      userName,
      microphone,
      speaking,
   }: {
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
            {player.showSpawnEffect && <SpawnEffect />}
            <NamePlate
               position={REMOTE_CHILD_POSITION}
               clientId={player.id}
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
               />
            </group>
         </group>
      )
   }
)

const RemotePlayers = () => {
   const playerPositions = usePlayerPositionsStore((state) => state.playerPositions)
   const audioClients = useClientAudioStore((state) => state.clients)

   const remotePlayerModels = useMemo(
      () =>
         Array.from(playerPositions.entries()).map(([clientId, data]) => (
            <RemotePlayer
               key={clientId}
               player={data}
               action={data.action}
               userName={data.userName}
               microphone={audioClients[clientId]?.microphone ?? data.microphone}
               speaking={audioClients[clientId]?.speaking}
            />
         )),
      [audioClients, playerPositions]
   )

   return <>{remotePlayerModels}</>
}

export default RemotePlayers
