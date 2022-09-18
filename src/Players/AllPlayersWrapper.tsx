import React, { useState, useRef, useEffect, useMemo } from 'react'
import { extend, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { Avatar } from './Avatar'
import {
   AmbientLight,
   SpotLight,
   PointLight,
   GridHelper,
   BoxGeometry,
} from 'three'

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
         const { p, r } = clients[client]

         return (
            <>
               <Text
                  rotation={[
                     camera.rotation.x,
                     camera.rotation.y,
                     camera.rotation.z,
                  ]}
                  position={[p[0], 13, p[2]]}
                  fontSize={1}
                  color="aqua"
                  anchorX="center"
                  anchorY="middle"
               >
                  {client}
               </Text>
               <Avatar rotation={[0, r, 0]} position={[p[0], 1.1, p[2]]} />
            </>
         )
      })

   // console.log(allPlayerModels)

   return <>{allPlayerModels.flat()}</>
}

export default AllPlayersWrapper
