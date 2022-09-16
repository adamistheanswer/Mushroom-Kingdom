import React from 'react'
import Player from './Player'

const RemotePlayers = ({ clientSocket, clients }) => {
   return (
      <>
         {Object.keys(clients)
            .filter((clientKey) => clientKey !== clientSocket.id)
            .map((client) => {
               const { p, r } = clients[client]
               return (
                  <Player key={client} id={client} position={p} rotation={r} />
               )
            })}
      </>
   )
}

export default RemotePlayers
