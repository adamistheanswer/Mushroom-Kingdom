import React from 'react'
import { extend } from '@react-three/fiber'
import { AmbientLight, DirectionalLight, HemisphereLight, DirectionalLightHelper } from 'three'

extend({
   AmbientLight,
   DirectionalLight,
   HemisphereLight,
   DirectionalLightHelper,
})

export default function Lighting() {
   return (
      <>
         <hemisphereLight
            args={[0xffffff, 0xfffffff, 0.2]}
            color={[0, 0, 0]}
            groundColor={[0, 2, 1]}
            position={[0, 600, 0]}
         />
         <directionalLight
            args={[0xffffff, 0.3]}
            position={[-240, 300, 0]}
            position-target={[0, 0, 0]}
            shadow-bias={-0.00001}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-near={1}
            shadow-camera-far={700}
            shadow-camera-left={700}
            shadow-camera-right={-700}
            shadow-camera-top={700}
            shadow-camera-bottom={-700}
            castShadow
         />

         <ambientLight intensity={0.2} />
      </>
   )
}
