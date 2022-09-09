import React from 'react'
import { Text } from '@react-three/drei'
import { extend } from '@react-three/fiber'
import { BoxGeometry, MeshNormalMaterial } from 'three'

extend({
    BoxGeometry,
    MeshNormalMaterial,
})

const UserWrapper = ({ position, rotation, id }) => {
    return (
        <mesh
            position={position}
            rotation={rotation}
            geometry={new BoxGeometry()}
            material={new MeshNormalMaterial()}
        >
            <Text
                position={[0, 1, 0]}
                color="black"
                anchorX="center"
                anchorY="middle"
            >
                {id}
            </Text>
        </mesh>
    )
}

export default UserWrapper
