import React, { useState, useEffect, useRef } from 'react'
import { AvatarAnimated } from './AvatarAnimated'

const AllPlayersWrapper = ({ clientSocket }) => {
   const [clientsConnected, setClientsConnected] = useState(0)

   const clients = useRef({})

   useEffect(() => {
      if (clientSocket) {
         clientSocket.on('clientUpdates', (updatedClients) => {
            clients.current = updatedClients
            if (Object.keys(updatedClients).length !== clientsConnected) {
               setClientsConnected(Object.keys(updatedClients).length)
            }
         })
      }
   }, [clientSocket])


   const allPlayerModels = clients &&
      Object.keys(clients.current)
         .filter((clientKey) => clientKey !== clientSocket.id)
         .map((client) => {
            return (
               <AvatarAnimated
                  key={client}
                  client={client}
                  clientSocket={clientSocket}
                  isLocal={clientSocket.id === client}
               />
            )
         })

   return <>{allPlayerModels.flat()}</>

}

export default AllPlayersWrapper
