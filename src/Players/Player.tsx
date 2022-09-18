import React from 'react'
import { Text, useFBX, useTexture } from '@react-three/drei'
import { extend, useThree } from '@react-three/fiber'
import { BoxGeometry, MeshNormalMaterial } from 'three'
import Mushy from './Mushy'

extend({
   BoxGeometry,
   MeshNormalMaterial,
})

const Player = ({ position, rotation, id }) => {
   // const model = useFBX('../Models/Player/mushyOld.fbx')
   // model.scale.setScalar(0.015)
   // model.traverse((f: { castShadow: boolean; receiveShadow: boolean }) => {
   //    f.castShadow = true
   //    f.receiveShadow = true
   // })

   // let model = useFBX('../Models/Player/Mushy.fbx')
   // model.scale.setScalar(0.015)
   // model.traverse((child: any) => {
   //    if (child.isSkinnedMesh) {
   //       const texture = useTexture('../Models/Player/mushySkin.png')
   //       child.material[1].map = texture
   //       child.material.needsupdate = true
   //       child.castShadow = true
   //       child.receiveShadow = true
   //    }
   // })

   // const fbxModel = useFBX('../Models/Player/Mushy.fbx')
   // const modelTexture = useTexture('../Models/Player/mushySkin.png')

   // fbxModel.scale.setScalar(0.015)
   // fbxModel.traverse((child: any) => {
   //    if (child.isSkinnedMesh) {
   //       const texture = modelTexture.clone()
   //       child.material[1].map = texture
   //       child.material.needsupdate = true
   //       child.castShadow = true
   //       child.receiveShadow = true
   //    }
   // })

   // function FBXHandler(url, scale, textureUrl) {
   //    let model = useFBX(url)
   //    // model.scale.setScalar(1)
   //    model.traverse((child: any) => {
   //       if (child.isSkinnedMesh) {
   //          const newTexture = useTexture(textureUrl)
   //          child.material[1].map = newTexture
   //          child.material.needsupdate = true
   //          child.castShadow = true
   //          child.receiveShadow = true
   //       }
   //    })
   //    model.scale.set(scale, scale, scale)
   //    return model.clone()
   // }

   const { camera } = useThree()

   // let clonedModel = model.clone()

   return (
      <>
         {/* <primitive
            position={[position[0], 1.1, position[2]]}
            rotation={[0, rotation, 0]}
            // object={FBXHandler(
            //    '../Models/Player/Mushy.fbx',
            //    0.015,
            //    '../Models/Player/mushySkin.png'
            // )}

            object={clonedModel}
         />
*/}
         <Text
            rotation={[camera.rotation.x, camera.rotation.y, camera.rotation.z]}
            position={[position[0], 13, position[2]]}
            fontSize={1}
            color="aqua"
            anchorX="center"
            anchorY="middle"
         >
            {id}
         </Text>
         {/* <Mushy
            id={id}
            pos={[position[0], 1.1, position[2]]}
            rot={[0, rotation, 0]}
         /> */}
      </>
   )
}

export default Player
