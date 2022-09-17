import React, { useMemo } from 'react'
import { Text, useFBX, useTexture } from '@react-three/drei'
import { extend, useThree } from '@react-three/fiber'
import { BoxGeometry, MeshNormalMaterial } from 'three'

extend({
   BoxGeometry,
   MeshNormalMaterial,
})

const Player = ({ position, rotation, id }) => {
   // const model = useFBX('../Models/Player/mushy.fbx')
   // let clonedModel = model.clone()
   // console.log(clonedModel)
   // clonedModel.scale.setScalar(0.015)
   // clonedModel.traverse(
   //    (f: { castShadow: boolean; receiveShadow: boolean }) => {
   //       f.castShadow = true
   //       f.receiveShadow = true
   //    }
   // )

   let model = useFBX('../Models/Player/Mushy.fbx')
   model.scale.setScalar(0.015)
   model.traverse((child: any) => {
      if (child.isSkinnedMesh) {
         const texture = useTexture('../Models/Player/mushySkin.png')
         child.material[0].map = texture
         child.material.needsupdate = true
         child.castShadow = true
         child.receiveShadow = true
      }
   })

   let clonedModel = model.clone()

   const { camera } = useThree()

   return (
      <>
         <primitive
            position={[position[0], 1.1, position[2]]}
            rotation={[0, rotation, 0]}
            object={clonedModel}
         />

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
      </>
   )
}

export default Player
