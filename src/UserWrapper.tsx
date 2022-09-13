import React, { useMemo } from 'react'
import { Text } from '@react-three/drei'
import { extend } from '@react-three/fiber'
import { BoxGeometry, MeshNormalMaterial } from 'three'

extend({
    BoxGeometry,
    MeshNormalMaterial,
})

const UserWrapper = ({ position, rotation, id }) => {
    const boxGemo = useMemo(() => new BoxGeometry(), [])
    const boxMat = useMemo(() => new MeshNormalMaterial(), [])
    return (
        <mesh
            position={position}
            rotation={rotation}
            geometry={boxGemo}
            material={boxMat}
        >
            <Text
                rotation={[0, Math.PI, 0]}
                position={[0, 1, 0]}
                color="aqua"
                anchorX="center"
                anchorY="middle"
            >
                {id}
            </Text>
        </mesh>
    )
}

export default UserWrapper
