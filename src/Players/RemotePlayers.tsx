import React, { useState, useEffect } from 'react'
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

function mapsEqual(a, b) {
   if (a.size !== b.size) return false
   for (const [key, value] of a.entries()) {
      if (!b.has(key) || b.get(key) !== value) return false
   }
   return true
}

const RemotePlayers = ({ clientSocket }) => {
   const localClientId = useUserStore((state) => state.localClientId)
   const playerPositions = usePlayerPositionsStore((state) => state.playerPositions)
   const updatePlayerPositions = usePlayerPositionsStore((state) => state.updatePlayerPositions)
   const removeDisconnectedPlayer = usePlayerPositionsStore((state) => state.removeDisconnectedPlayer)

   useEffect(() => {
      const handleClientUpdates = (event) => {
         const message = decode(new Uint8Array(event.data)) as WebSocketMessage
         if (message.type === 'clientUpdates') {
            const updatedClients = message.payload
            localClientId && updatePlayerPositions(updatedClients, localClientId)
         } else if (message.type === 'clientDisconnect') {
            const disconnectedClientId = message.payload
            removeDisconnectedPlayer(disconnectedClientId)
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
