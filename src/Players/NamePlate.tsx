import React, { useRef, useEffect } from 'react'
import { Text } from '@react-three/drei'
import { Vector3 } from 'three'
import { useFrame, useThree } from '@react-three/fiber'

interface NamePlateProps {
   position: Vector3
   isLocal: boolean
   clientId: String
}

export const NamePlate = React.memo<NamePlateProps>(
   ({ position = new Vector3(0, 0, 0), isLocal, clientId }) => {
      const nameplateRef = useRef<THREE.Group>(null!)
      const nameplateHeight = 13

      const { camera } = useThree()

      useFrame(() => {
        if (isLocal) {
           nameplateRef.current.rotation.x = 0
           nameplateRef.current.rotation.y = 0
           nameplateRef.current.rotation.z = 0
        } else {
           nameplateRef.current.rotation.x = camera.rotation.x
           nameplateRef.current.rotation.y = camera.rotation.y
           nameplateRef.current.rotation.z = camera.rotation.z
        }
     })

      useEffect(() => {
         nameplateRef.current.position.copy(position)
         nameplateRef.current.position.y = nameplateRef.current.position.y + nameplateHeight
      }, [position])

      return (
         <Text ref={nameplateRef} fontSize={1} color={isLocal ? 'yellow' : 'white'} anchorX="center" anchorY="middle">
            {clientId}
         </Text>
      )
   }
)
