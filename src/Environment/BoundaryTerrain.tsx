import React, { useLayoutEffect, useRef } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import { PLAYER_COLLISION_RADIUS, PLAYER_WORLD_LIMIT } from '../constants'
import { createTerrainNoise, fbm, getTerrainHeightAtWorld } from './terrain'

const SEGMENTS_PER_SIDE = 128
const PERIMETER_SEGMENTS = SEGMENTS_PER_SIDE * 4

// Leave room for the player's body beyond the centre-based movement limit.
// The profile adds a small gap before the almost vertical first face;
// broader ledges and a second ridge sit outside the playable meadow.
// End at the crest: the outward slopes are hidden from the playable area,
// so omit their vertices and triangles from both rendering and shadow passes.
const PROFILE = [
   { offset: 1, height: -3, irregularity: 0 },
   { offset: 1.5, height: 7, irregularity: 0.3 },
   { offset: 5, height: 24, irregularity: 2 },
   { offset: 16, height: 27, irregularity: 5 },
   { offset: 40, height: 58, irregularity: 12 },
]

const ROCK_DARK = new Color('#55534b')
const ROCK_LIGHT = new Color('#918777')
const MOSS = new Color('#59633b')
const EARTH = new Color('#504632')

function squarePoint(index: number) {
   const side = Math.floor(index / SEGMENTS_PER_SIDE)
   const along = ((index % SEGMENTS_PER_SIDE) / SEGMENTS_PER_SIDE) * 2 - 1

   switch (side) {
      case 0:
         return [along, -1]
      case 1:
         return [1, along]
      case 2:
         return [-along, 1]
      default:
         return [-1, -along]
   }
}

function buildBoundaryGeometry(geometry: BufferGeometry) {
   const noise = createTerrainNoise()
   const positions: number[] = []
   const colors: number[] = []
   const indices: number[] = []
   const color = new Color()

   PROFILE.forEach((band, bandIndex) => {
      for (let segment = 0; segment < PERIMETER_SEGMENTS; segment++) {
         const [directionX, directionZ] = squarePoint(segment)
         const sampleX = directionX * PLAYER_WORLD_LIMIT
         const sampleZ = directionZ * PLAYER_WORLD_LIMIT
         const broad = fbm(noise, sampleX * 0.009 + 71, sampleZ * 0.009 - 43, 3)
         const crags = noise(sampleX * 0.065 + 120, sampleZ * 0.065 - 80)
         const radius = PLAYER_WORLD_LIMIT + PLAYER_COLLISION_RADIUS + band.offset + crags * band.irregularity
         const x = directionX * radius
         const z = directionZ * radius
         const ground = getTerrainHeightAtWorld(x, z, noise)
         const height =
            band.height > 0 ? band.height * (0.65 + broad * 0.85) + crags * Math.min(4, bandIndex) : band.height

         positions.push(x, ground + height, z)

         const mineral = fbm(noise, sampleX * 0.045 + bandIndex * 0.7, sampleZ * 0.045, 2)
         color.copy(ROCK_DARK).lerp(ROCK_LIGHT, mineral)
         // Moss gathers on the shelf and ridge tops, leaving the steep faces rocky.
         if (bandIndex === 3 || bandIndex === 4) {
            color.lerp(MOSS, 0.45 + broad * 0.4)
         } else if (bandIndex === 0) {
            color.lerp(EARTH, 0.8)
         }
         colors.push(color.r, color.g, color.b)

         if (bandIndex < PROFILE.length - 1) {
            // Wrap each ring explicitly so all four corners and the final seam
            // share vertices. Independent cliff panels would leave visible gaps.
            const next = (segment + 1) % PERIMETER_SEGMENTS
            const a = bandIndex * PERIMETER_SEGMENTS + segment
            const b = bandIndex * PERIMETER_SEGMENTS + next
            const c = a + PERIMETER_SEGMENTS
            const d = b + PERIMETER_SEGMENTS
            indices.push(a, b, c, b, d, c)
         }
      }
   })

   geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
   geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
   geometry.setIndex(indices)
   geometry.computeVertexNormals()
   geometry.computeBoundingSphere()
}

export default function BoundaryTerrain() {
   const geometry = useRef<BufferGeometry>(null!)

   useLayoutEffect(() => {
      buildBoundaryGeometry(geometry.current)
   }, [])

   return (
      <mesh castShadow receiveShadow>
         <bufferGeometry ref={geometry} />
         <meshStandardMaterial vertexColors roughness={1} flatShading />
      </mesh>
   )
}
