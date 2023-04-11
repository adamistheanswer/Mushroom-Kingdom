import React, { useEffect } from 'react'
import { Avatar } from './Avatar'
import useUserStore from '../State/userStore'
import { Euler, Vector3 } from 'three'
import { NamePlate } from './NamePlate'
import { decode } from '@msgpack/msgpack'
import { usePlayerPositionsStore } from '../State/playerPositionsStore'

interface WebSocketMessage {
   type: string
   payload: any
}

const RemotePlayers = ({ clientSocket }) => {
   const localClientId = useUserStore((state) => state.localClientId)
   const playerPositions = usePlayerPositionsStore((state) => state.playerPositions)
   const updatePlayerPositions = usePlayerPositionsStore((state) => state.updatePlayerPositions)
   const removeDisconnectedPlayer = usePlayerPositionsStore((state) => state.removeDisconnectedPlayer)

   useEffect(() => {
      const handleClientUpdates = (event) => {
         const message = decode(event.data) as WebSocketMessage
         switch (message.type) {
            case 'clientUpdates':
               localClientId && updatePlayerPositions(message.payload, localClientId)
            case 'clientDisconnect':
               removeDisconnectedPlayer(message.payload)
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
   }, [clientSocket])

   const remotePlayerModels = Array.from(playerPositions.entries()).map(([clientId, data]) => {
      const position = new Vector3(data.position.x, data.position.y, data.position.z)
      const rotation = new Euler(data.rotation[0], data.rotation[1], data.rotation[2])
      return (
         <>
            <NamePlate key={clientId} position={position} clientId={clientId} socket={clientSocket} isLocal={false} />
            <Avatar
               key={clientId}
               position={position}
               rotation={rotation}
               clientId={clientId}
               clientSocket={clientSocket}
            />
         </>
      )
   })

   return <>{remotePlayerModels.flat()}</>
}

export default RemotePlayers
