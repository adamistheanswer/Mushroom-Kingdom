import React, { useState, useEffect, useMemo } from 'react'
import { extend, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { AvatarAnimated } from './AvatarAnimated'

import {
   AmbientLight,
   SpotLight,
   PointLight,
   GridHelper,
   BoxGeometry,
   Material,
   Mesh,
   SphereGeometry,
   MeshPhongMaterial,
} from 'three'
extend({
   AmbientLight,
   SpotLight,
   PointLight,
   GridHelper,
   Material,
   BoxGeometry,
   Mesh,
})

let actions = [
   'Dance',
   'Dance2',
   'Excited',
   'Idle',
   'Punch',
   'Salute',
   'StrafeLeft',
   'StrafeRight',
   'Walking',
   'WalkingB',
   'Waving',
]

function playerActionsIndexesToActions(indexArr) {
   return indexArr
      .map((index) => {
         return actions[index]
      })
      .toString()
}

const AllPlayersWrapper = ({ clientSocket }) => {
   const [clients, setClients] = useState({})
   const boxGemo = useMemo(() => new SphereGeometry(7), [])
   const boxMat = useMemo(() => new MeshPhongMaterial({ transparent: true, opacity: 0 }), [])

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
               <mesh
                  name={'playerHitbox'}
                  geometry={boxGemo}
                  material={boxMat}
                  position={[p[0], 5, p[2]]}
                  rotation={[0, Math.PI + r, 0]}
               ></mesh>
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
               <AvatarAnimated
                  playerActions={playerActionsIndexesToActions(s)}
                  position={[p[0], 0, p[2]]}
                  rotation={[0, Math.PI + r, 0]}
               />
            </>
         )
      })

   return <>{allPlayerModels.flat()}</>
}

export default AllPlayersWrapper
