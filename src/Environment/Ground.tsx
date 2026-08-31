import React, { useLayoutEffect, useMemo, useRef } from 'react'
import { Float32BufferAttribute, PlaneGeometry } from 'three'
import { WORLD_SIZE } from '../constants'
import { createTerrainNoise, getTerrainHeightAtGrid, TERRAIN_SEGMENTS } from './terrain'

const Ground: React.FC = () => {
   const noise2D = useMemo(() => createTerrainNoise(), [])

   const terrain = useRef<PlaneGeometry>(null!)

   useLayoutEffect(() => {
      const pos = terrain.current.getAttribute('position') as Float32BufferAttribute
      const pa = pos.array

      const hVerts = terrain.current.parameters.heightSegments + 1
      const wVerts = terrain.current.parameters.widthSegments + 1

      for (let j = 0; j < hVerts; j++) {
         for (let i = 0; i < wVerts; i++) {
            // @ts-ignore
            pa[3 * (j * wVerts + i) + 2] = getTerrainHeightAtGrid(i, j, noise2D)
         }
      }

      pos.needsUpdate = true

      terrain.current.computeVertexNormals()
   }, [noise2D])

   return (
      <mesh position={[0, 0, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
         <planeGeometry
            attach="geometry"
            args={[WORLD_SIZE, WORLD_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS]}
            ref={terrain}
         />
         <meshStandardMaterial attach="material" color="#5b603f" />
      </mesh>
   )
}

export default Ground
