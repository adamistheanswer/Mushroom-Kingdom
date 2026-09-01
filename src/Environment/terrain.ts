import { createNoise2D } from 'simplex-noise'
import { WORLD_HALF_SIZE, WORLD_SIZE } from '../constants'

export const TERRAIN_SEGMENTS = 1000

export type TerrainNoise = ReturnType<typeof createNoise2D>

export function seededRandom(seed: number) {
   let value = seed

   return () => {
      value = (value * 1664525 + 1013904223) >>> 0
      return value / 4294967296
   }
}

export function fbm(noise2D: TerrainNoise, x: number, z: number, octaves: number) {
   let amplitude = 1
   let frequency = 1
   let total = 0
   let normalisation = 0

   for (let octave = 0; octave < octaves; octave++) {
      total += noise2D(x * frequency, z * frequency) * amplitude
      normalisation += amplitude
      amplitude *= 0.5
      frequency *= 2
   }

   return total / normalisation / 2 + 0.5
}

export function createTerrainNoise() {
   return createNoise2D(seededRandom(123456789))
}

function terrainRandom(x: number, z: number) {
   const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123
   return n - Math.floor(n)
}

// Soil relief, on top of the rolling landform. One grid step is one world unit, so a wavelength
// this short is close to what the mesh can actually resolve - any finer and it aliases into a
// shimmer rather than reading as lumpy ground. The amplitude is deliberately less than the
// clearance the grass shader already leaves above the terrain, so blades keep their seating.
const SOIL_RELIEF_AMPLITUDE = 0.2
const SOIL_RELIEF_WAVELENGTH = 7

export function getTerrainHeightAtGrid(x: number, z: number, noise2D: TerrainNoise) {
   const ex = terrainRandom(Math.floor(x), Math.floor(z))
   const landform =
      (noise2D(x / 100, z / 100) +
         noise2D((x + 200) / 50, z / 50) * Math.pow(ex, 1) +
         noise2D((x + 400) / 25, z / 25) * Math.pow(ex, 2) +
         noise2D((x + 600) / 12.5, z / 12.5) * Math.pow(ex, 3) +
         noise2D((x + 800) / 6.25, z / 6.25) * Math.pow(ex, 4)) /
      2

   return (
      landform +
      noise2D((x + 1200) / SOIL_RELIEF_WAVELENGTH, (z - 900) / SOIL_RELIEF_WAVELENGTH) * SOIL_RELIEF_AMPLITUDE
   )
}

export function getTerrainHeightAtWorld(x: number, z: number, noise2D: TerrainNoise) {
   const gridX = ((x + WORLD_HALF_SIZE) / WORLD_SIZE) * TERRAIN_SEGMENTS
   const gridZ = ((z + WORLD_HALF_SIZE) / WORLD_SIZE) * TERRAIN_SEGMENTS

   return getTerrainHeightAtGrid(gridX, gridZ, noise2D)
}
