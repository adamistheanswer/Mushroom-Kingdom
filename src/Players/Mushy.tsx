import React, { Suspense, useRef } from 'react'
import { useFBX } from '@react-three/drei'
import { Mesh, Vector3 } from 'three'

export default function Mushy({ id, pos, rot }) {
   let fbx = useFBX('../Models/Player/Alien.fbx')
   // fbx.scale.setScalar(0.015)

   console.log(fbx)
   fbx.traverse((child: any) => {
      if (child.isSkinnedMesh) {
         // const texture = modelTexture
         // child.material[1].map = texture
         child.scale.setScalar(0.015)
         child.castShadow = true
         child.receiveShadow = true
      }
   })

   const meshRef = useRef<Mesh>(null)
   // fbx.scale.setScalar(0.015)
   const fbxClone = fbx.clone(true)
   console.log(fbxClone)
   return (
      <Suspense fallback={null}>
         <mesh
            key={id}
            ref={meshRef}
            scale={0.15}
            position={pos}
            rotation={rot}
         >
            <primitive
               // scale={new Vector3(0.015, 0.015, 0.015)}
               object={fbxClone}
               dispose={null}
            />
         </mesh>
      </Suspense>
   )
}
