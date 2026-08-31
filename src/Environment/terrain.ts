import { createNoise2D } from 'simplex-noise'
import { WORLD_HALF_SIZE, WORLD_SIZE } from '../constants'

export const TERRAIN_SEGMENTS = 1000

export type TerrainNoise = ReturnType<typeof createNoise2D>

function seededRandom(seed: number) {
   let value = seed

   return () => {
      value = (value * 1664525 + 1013904223) >>> 0
      return value / 4294967296
   }
}

export function createTerrainNoise() {
   return createNoise2D(seededRandom(123456789))
}

function terrainRandom(x: number, z: number) {
   const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123
   return n - Math.floor(n)
}

export function getTerrainHeightAtGrid(x: number, z: number, noise2D: TerrainNoise) {
   const ex = terrainRandom(Math.floor(x), Math.floor(z))

   return (
      (noise2D(x / 100, z / 100) +
         noise2D((x + 200) / 50, z / 50) * Math.pow(ex, 1) +
         noise2D((x + 400) / 25, z / 25) * Math.pow(ex, 2) +
         noise2D((x + 600) / 12.5, z / 12.5) * Math.pow(ex, 3) +
         noise2D((x + 800) / 6.25, z / 6.25) * Math.pow(ex, 4)) /
      2
   )
}

export function getTerrainHeightAtWorld(x: number, z: number, noise2D: TerrainNoise) {
   const gridX = ((x + WORLD_HALF_SIZE) / WORLD_SIZE) * TERRAIN_SEGMENTS
   const gridZ = ((z + WORLD_HALF_SIZE) / WORLD_SIZE) * TERRAIN_SEGMENTS

   return getTerrainHeightAtGrid(gridX, gridZ, noise2D)
}
