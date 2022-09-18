// import React from 'react'
// import Player from './Player'

// const RemotePlayers = ({ clientSocket, clients }) => {
//    return (
//       <>
//          {Object.keys(clients)
//             .filter((clientKey) => clientKey !== clientSocket.id)
//             .map((client) => {
//                const { p, r } = clients[client]
//                return (
//                   <Player key={client} id={client} position={p} rotation={r} />
//                )
//             })}
//       </>
//    )
// }

// export default RemotePlayers

import React from 'react'

import { useFBX, Text } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
// import Mushy from './Mushy'

const RemotePlayers = ({ clientSocket, clients }) => {
   const playersArray: JSX.Element[] = []

   // let scale = 0.015
   // function FBXHandler(url, scale) {
   //    let model = useFBX(url)

   //    // model.scale.setScalar(scale)
   //    // clone.traverse((child: any) => {
   //    //    if (child.isSkinnedMesh) {
   //    //       // console.log(child)
   //    //       child.material[1].map = texture
   //    //       child.material.needsUpdate = true
   //    //       child.castShadow = true
   //    //       child.receiveShadow = true
   //    //    }
   //    // })

   //    return model.clone(true)
   // }

   const { camera } = useThree()

   Object.keys(clients)
      .filter((clientKey) => clientKey !== clientSocket.id)
      .map((client) => {
         const { p, r } = clients[client]

         const model = (
            <group>
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
               {/* <Mushy id={client} rot={[0, r, 0]} pos={[p[0], 1.1, p[2]]} /> */}
            </group>
         )

         playersArray.push(model)
      })

   return <>{playersArray.flat()}</>
}

export default RemotePlayers
