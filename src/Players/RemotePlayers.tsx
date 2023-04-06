// import React, { useState, useEffect, useRef } from 'react'
// import { AvatarAnimated } from './AvatarAnimated'
// import useUserStore from '../State/userStore'

// const RemotePlayers = ({ clientSocket }) => {
//    const [clientsConnected, setClientsConnected] = useState(0)
//    const clientId = useUserStore((state) => state.clientId)
//    const clients = useRef({})

//    useEffect(() => {
//       if (clientSocket) {
//         clientSocket.addEventListener('message', (event) => {
//           const data = JSON.parse(event.data);
//           if (data.type === 'clientUpdates') {

//             const updatedClients = data.payload;
//             console.log(updatedClients)
//             clients.current = updatedClients;
//             if (Object.keys(updatedClients).length !== clientsConnected) {
//               setClientsConnected(Object.keys(updatedClients).length);
//             }
//           }
//         });
//       }

//       return () => {
//         if (clientSocket) {
//           clientSocket.removeEventListener('message');
//         }
//       };
//     }, [clientSocket]);

//    const allPlayerModels =
//       clients &&
//       Object.keys(clients.current)
//          // .filter((clientKey) => clientKey !== clientId)
//          .map((client) => {
//             return (
//                <AvatarAnimated key={client} client={client} clientSocket={clientSocket} isLocal={clientId === client} />
//             )
//          })
//          .flat()

//    return <>{allPlayerModels}</>
// }

// export default RemotePlayers

import React, { useState, useEffect } from 'react'
import { AvatarAnimated } from './AvatarAnimated2'
import useUserStore from '../State/userStore'
import { Euler, Vector3 } from 'three'

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
         const data = JSON.parse(event.data)
         if (data.type === 'clientUpdates') {
            const updatedClients = data.payload

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
         } else if (data.type === 'clientDisconnect') {
            const disconnectedClientId = data.payload
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
      const rotation = new Euler(data.rotation[0], data.rotation[1] + Math.PI , data.rotation[2])
      return <AvatarAnimated key={clientId} position={position} rotation={rotation} />
   })

   return <>{remotePlayerModels.flat()}</>
}

export default RemotePlayers
