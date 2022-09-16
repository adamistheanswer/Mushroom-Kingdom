import React, { useMemo } from 'react'
import { Text } from '@react-three/drei'
import { extend } from '@react-three/fiber'
import { BoxGeometry, MeshNormalMaterial } from 'three'

extend({
   BoxGeometry,
   MeshNormalMaterial,
})

const Player = ({ position, rotation, id }) => {
   const boxGemo = useMemo(() => new BoxGeometry(10, 10, 10), [])
   const boxMat = useMemo(() => new MeshNormalMaterial(), [])

   return (
      <mesh
         position={[position[0], 5, position[2]]}
         rotation={[0, rotation, 0]}
         geometry={boxGemo}
         material={boxMat}
         castShadow
         receiveShadow
      >
         <Text
            rotation={[0, Math.PI, 0]}
            position={[0, 7, 0]}
            fontSize={1}
            color="aqua"
            anchorX="center"
            anchorY="middle"
         >
            {id}
         </Text>
      </mesh>
   )
}

export default Player
