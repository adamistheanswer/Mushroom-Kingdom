import React, { useState, useEffect } from 'react'
import { extend, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { AvatarAnimated } from './AvatarAnimated'

import { AmbientLight, SpotLight, PointLight, GridHelper, BoxGeometry, Material, Mesh } from 'three'

extend({
   AmbientLight,
   SpotLight,
   PointLight,
   GridHelper,
   Material,
   BoxGeometry,
   Mesh,
})

const AllPlayersWrapper = ({ clientSocket }) => {
   const [clients, setClients] = useState({})

   const { camera } = useThree()
   useEffect(() => {
      if (clientSocket) {
         clientSocket.on('clientUpdates', (updatedClients) => {
            setClients(updatedClients)
         })
      }
   }, [clientSocket])

   const allPlayerModels = Object.keys(clients)
      .filter((clientKey) => clientKey !== clientSocket.id)
      .map((client) => {
         const { p, r, s } = clients[client]
         return (
            <>
               <Text
                  rotation={[camera.rotation.x, camera.rotation.y, camera.rotation.z]}
                  position={[p[0], 13, p[2]]}
                  fontSize={1}
                  color="aqua"
                  anchorX="center"
                  anchorY="middle"
               >
                  {client}
               </Text>
               <AvatarAnimated action={s} position={[p[0], 0, p[2]]} rotation={[0, Math.PI + r, 0]} />
            </>
         )
      })

   return <>{allPlayerModels.flat()}</>
}

export default AllPlayersWrapper
