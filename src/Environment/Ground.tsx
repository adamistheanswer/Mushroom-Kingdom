import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
   Color,
   DataTexture,
   Float32BufferAttribute,
   LinearFilter,
   LinearMipmapLinearFilter,
   NoColorSpace,
   PlaneGeometry,
   RepeatWrapping,
   RGBAFormat,
   Uint8BufferAttribute,
   UnsignedByteType,
} from 'three'
import { WORLD_SIZE } from '../constants'
import { createTerrainNoise, fbm, getTerrainHeightAtGrid, seededRandom, TERRAIN_SEGMENTS } from './terrain'
import type { TerrainNoise } from './terrain'

/**
 * The ground was one flat colour over a million vertices, which is why it read as a sheet rather
 * than as soil - a surface with no variation at any scale looks synthetic no matter how good the
 * silhouette under it is. Three things fix that, and none of them cost anything per frame:
 *
 *   - Fine relief baked into the terrain height itself (see terrain.ts), so the mesh normals
 *     already vary and the directional light does the shading work for free.
 *   - Soil colour baked into a vertex colour attribute, driven by elevation, slope and one
 *     broad patch field. Slope is the interesting one: it comes from heights that are already
 *     in memory, so the relief above shows up as colour as well as shape for no extra noise.
 *   - A small tiling grain texture for the high frequency grit, which is the one scale vertex
 *     colours cannot reach at a vertex per world unit - and being a texture it mipmaps, so it
 *     settles down with distance instead of crawling.
 */

const SOIL_GRAIN_SIZE = 256
// World units covered by one repeat of the grain texture.
const SOIL_GRAIN_TILE = 10
// How far the grain is allowed to darken the soil under it. This is a linear multiplier, not a
// colour, which is why the texture below is tagged NoColorSpace - letting it be treated as sRGB
// would silently deepen every one of these values and turn grit into blotches.
const SOIL_GRAIN_DEPTH = 0.62

// Damp earth in the hollows through to dry dust on the rises, plus the barer, warmer soil that
// gets exposed wherever the ground tilts. Written as hex so Color converts them out of sRGB for
// us: vertex colours are consumed in the linear working space, unlike a texture, and authoring
// these by eye in linear would be guesswork.
const SOIL_DAMP = new Color('#3a3626')
const SOIL_LOAM = new Color('#5a5438')
const SOIL_DRY = new Color('#847a58')
const SOIL_BARE = new Color('#6b5335')

const SOIL_PATCH_SCALE = 0.021
const SOIL_SLOPE_GAIN = 0.9
const SOIL_SLOPE_STRENGTH = 0.6

function smoothstep(edge0: number, edge1: number, value: number) {
   const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0 || 1)))

   return t * t * (3 - 2 * t)
}

/**
 * Separable box blur that wraps at the edges, which is what makes the grain texture tile without
 * a seam: every texel is averaged with neighbours from the opposite edge, so the join is as
 * continuous as the middle.
 */
function blurWrapped(field: Float32Array, size: number) {
   const horizontal = new Float32Array(field.length)
   const blurred = new Float32Array(field.length)

   for (let y = 0; y < size; y++) {
      const row = y * size

      for (let x = 0; x < size; x++) {
         horizontal[row + x] =
            (field[row + ((x + size - 1) % size)] + field[row + x] + field[row + ((x + 1) % size)]) / 3
      }
   }

   for (let y = 0; y < size; y++) {
      const above = ((y + size - 1) % size) * size
      const below = ((y + 1) % size) * size
      const row = y * size

      for (let x = 0; x < size; x++) {
         blurred[row + x] = (horizontal[above + x] + horizontal[row + x] + horizontal[below + x]) / 3
      }
   }

   return blurred
}

/** Blurring collapses the range, so each octave is stretched back out before they are mixed. */
function normalise(field: Float32Array) {
   let min = Infinity
   let max = -Infinity

   for (let index = 0; index < field.length; index++) {
      min = Math.min(min, field[index])
      max = Math.max(max, field[index])
   }

   const range = max - min || 1
   const stretched = new Float32Array(field.length)

   for (let index = 0; index < field.length; index++) {
      stretched[index] = (field[index] - min) / range
   }

   return stretched
}

/**
 * Grit and clods, as two octaves of wrapped value noise. White noise on its own reads as static;
 * one blur clumps it to a few texels across, and a few more give the broader lumps that stop the
 * surface looking uniformly sandy.
 */
function createSoilGrainTexture() {
   const size = SOIL_GRAIN_SIZE
   const random = seededRandom(987654321)
   const white = new Float32Array(size * size)

   for (let index = 0; index < white.length; index++) {
      white[index] = random()
   }

   const grit = blurWrapped(white, size)
   let clods = grit

   for (let pass = 0; pass < 3; pass++) {
      clods = blurWrapped(clods, size)
   }

   const fine = normalise(grit)
   const coarse = normalise(clods)
   const pixels = new Uint8Array(size * size * 4)

   for (let index = 0; index < fine.length; index++) {
      const value = SOIL_GRAIN_DEPTH + (1 - SOIL_GRAIN_DEPTH) * (fine[index] * 0.55 + coarse[index] * 0.45)
      const byte = Math.round(value * 255)
      const pixelIndex = index * 4

      pixels[pixelIndex] = byte
      pixels[pixelIndex + 1] = byte
      pixels[pixelIndex + 2] = byte
      pixels[pixelIndex + 3] = 255
   }

   const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType)

   texture.wrapS = RepeatWrapping
   texture.wrapT = RepeatWrapping
   texture.repeat.set(WORLD_SIZE / SOIL_GRAIN_TILE, WORLD_SIZE / SOIL_GRAIN_TILE)
   texture.minFilter = LinearMipmapLinearFilter
   texture.magFilter = LinearFilter
   texture.generateMipmaps = true
   texture.anisotropy = 4
   texture.colorSpace = NoColorSpace
   texture.needsUpdate = true

   return texture
}

/**
 * One soil colour per vertex, which at a vertex per world unit is a finer grid than a texture of
 * any sane size would give across a kilometre of ground - and it costs nothing to sample.
 */
function bakeSoilColours(
   heights: Float32Array,
   wVerts: number,
   hVerts: number,
   minHeight: number,
   maxHeight: number,
   noise2D: TerrainNoise
) {
   const colours = new Uint8Array(wVerts * hVerts * 3)
   const range = maxHeight - minHeight || 1
   const halfWorld = WORLD_SIZE / 2
   const colour = new Color()
   const random = seededRandom(20240917)

   for (let j = 0; j < hVerts; j++) {
      for (let i = 0; i < wVerts; i++) {
         const index = j * wVerts + i
         const elevation = (heights[index] - minHeight) / range

         // Central differences over heights that are already in the array. Clamping at the
         // border rather than wrapping keeps the world edge from picking up a false ridge.
         const left = heights[index - (i > 0 ? 1 : 0)]
         const right = heights[index + (i < wVerts - 1 ? 1 : 0)]
         const above = heights[index - (j > 0 ? wVerts : 0)]
         const below = heights[index + (j < hVerts - 1 ? wVerts : 0)]
         const slope = Math.min(1, Math.hypot(right - left, below - above) * SOIL_SLOPE_GAIN)

         // The grid maps one to one onto world coordinates, the same mapping the grass field
         // texture uses, so this patch field lands in step with the grass above it.
         const patch = fbm(
            noise2D,
            (i - halfWorld) * SOIL_PATCH_SCALE + 640,
            (j - halfWorld) * SOIL_PATCH_SCALE - 410,
            1
         )
         const dryness = elevation * 0.55 + patch * 0.45

         colour.copy(SOIL_DAMP).lerp(SOIL_LOAM, smoothstep(0.0, 0.55, dryness))
         colour.lerp(SOIL_DRY, smoothstep(0.45, 1.0, dryness))
         colour.lerp(SOIL_BARE, slope * SOIL_SLOPE_STRENGTH)

         // Eight bits per channel is plenty of range but not plenty of precision down in the
         // darks where this palette lives, and a smooth gradient across it bands visibly.
         // Rounding with a random offset trades that banding for noise the grain hides anyway.
         const dither = random() - 0.5
         const colourIndex = index * 3

         colours[colourIndex] = Math.min(255, Math.max(0, Math.round(colour.r * 255 + dither)))
         colours[colourIndex + 1] = Math.min(255, Math.max(0, Math.round(colour.g * 255 + dither)))
         colours[colourIndex + 2] = Math.min(255, Math.max(0, Math.round(colour.b * 255 + dither)))
      }
   }

   return colours
}

const Ground: React.FC = () => {
   const noise2D = useMemo(() => createTerrainNoise(), [])
   const grainMap = useMemo(() => createSoilGrainTexture(), [])

   const terrain = useRef<PlaneGeometry>(null!)

   useEffect(() => () => grainMap.dispose(), [grainMap])

   useLayoutEffect(() => {
      const geometry = terrain.current
      const pos = geometry.getAttribute('position') as Float32BufferAttribute
      const pa = pos.array

      const hVerts = geometry.parameters.heightSegments + 1
      const wVerts = geometry.parameters.widthSegments + 1

      // Kept alongside the position array so the colour pass can read neighbours for slope
      // without paying for the noise a second time.
      const heights = new Float32Array(wVerts * hVerts)
      let minHeight = Infinity
      let maxHeight = -Infinity

      for (let j = 0; j < hVerts; j++) {
         for (let i = 0; i < wVerts; i++) {
            const index = j * wVerts + i
            const height = getTerrainHeightAtGrid(i, j, noise2D)

            heights[index] = height
            // @ts-ignore
            pa[3 * index + 2] = height

            if (height < minHeight) {
               minHeight = height
            }

            if (height > maxHeight) {
               maxHeight = height
            }
         }
      }

      pos.needsUpdate = true

      geometry.computeVertexNormals()
      geometry.setAttribute(
         'color',
         new Uint8BufferAttribute(bakeSoilColours(heights, wVerts, hVerts, minHeight, maxHeight, noise2D), 3, true)
      )
   }, [noise2D])

   return (
      <mesh position={[0, 0, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
         <planeGeometry
            attach="geometry"
            args={[WORLD_SIZE, WORLD_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS]}
            ref={terrain}
         />
         <meshStandardMaterial attach="material" color="#ffffff" map={grainMap} vertexColors roughness={1} />
      </mesh>
   )
}

export default Ground
