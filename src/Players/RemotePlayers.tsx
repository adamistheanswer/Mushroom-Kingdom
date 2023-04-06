import React, { useState, useEffect } from 'react'
import { Avatar } from './Avatar'
import useUserStore from '../State/userStore'
import { Euler, Vector3 } from 'three'
import { NamePlate } from './NamePlate'
import { decode } from '@msgpack/msgpack'

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
   const [playerPositions, setPlayerPositions] = useState(new Map())
   const localClientId = useUserStore((state) => state.localClientId)

   useEffect(() => {
      const handleClientUpdates = (event) => {
         const message = decode(new Uint8Array(event.data)) as WebSocketMessage
         if (message.type === 'clientUpdates') {
            const updatedClients = message.payload

            setPlayerPositions((prevPositions) => {
               const newPositions = new Map(prevPositions)
               for (const clientId in updatedClients) {
                  if (clientId !== localClientId) {
                     const { position, rotation } = updatedClients[clientId]
                     newPositions.set(clientId, { position, rotation })
                  }
               }
               return mapsEqual(prevPositions, newPositions) ? prevPositions : newPositions
            })
         } else if (message.type === 'clientDisconnect') {
            const disconnectedClientId = message.payload
            setPlayerPositions((prevPositions) => {
               const newPositions = new Map(prevPositions)
               newPositions.delete(disconnectedClientId)
               return newPositions
            })
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
            <NamePlate key={clientId} position={position} clientId={clientId} isLocal={false} />
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
