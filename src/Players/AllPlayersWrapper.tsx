import React, { useState, useRef, useEffect, useMemo } from 'react'
import { extend } from '@react-three/fiber'
import LocalPlayerWrapper from './LocalPlayerWrapper'
import { Socket } from 'socket.io'

import {
   AmbientLight,
   SpotLight,
   PointLight,
   GridHelper,
   Mesh,
   BoxGeometry,
   Material,
} from 'three'
import RemotePlayers from './RemotePlayers'

extend({
   AmbientLight,
   SpotLight,
   PointLight,
   GridHelper,
})

extend({
   BoxGeometry,
})

const AllPlayersWrapper = ({ clientSocket }) => {
   const [clients, setClients] = useState({})
   const remoteColliders = useRef<any>([])
   const boxGemo = useMemo(() => new BoxGeometry(1, 1, 1), [])

   useEffect(() => {
      if (clientSocket) {
         let cols: Mesh<BoxGeometry, Material | Material[]>[] = []
         Object.keys(clients)
            .filter((clientKey) => clientKey !== clientSocket.id)
            .map((client) => {
               const { p, r } = clients[client]

               let player = new Mesh(boxGemo)
               player.position.set(p[0], p[1], p[2])
               player.rotation.set(0, r, 0, 'XYZ')
               player.updateMatrixWorld(true)
               cols.push(player)
            })
         remoteColliders.current = cols
      }
   }, [clients])

   useEffect(() => {
      if (clientSocket) {
         clientSocket.on('clientUpdates', (updatedClients) => {
            setClients(updatedClients)
         })
      }
   }, [clientSocket])

   return (
      <>
         <LocalPlayerWrapper
            clientSocket={clientSocket}
            remoteColliders={remoteColliders}
         />
         <RemotePlayers clientSocket={clientSocket} clients={clients} />
      </>
   )
}

export default AllPlayersWrapper
