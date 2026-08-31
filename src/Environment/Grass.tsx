import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
   BufferAttribute,
   ClampToEdgeWrapping,
   DataTexture,
   DoubleSide,
   InstancedBufferAttribute,
   InstancedBufferGeometry,
   LinearFilter,
   RGBAFormat,
   ShaderMaterial,
   UnsignedByteType,
   Vector2,
   Vector3,
} from 'three'
import { WORLD_HALF_SIZE } from '../constants'
import { usePlayerPositionsStore } from '../State/playerPositionsStore'
import { createTerrainNoise, getTerrainHeightAtWorld } from './terrain'

const GRASS_BLADES = 400000
const GRASS_LAYER_CHUNKS = 8
const GRASS_BLADES_PER_CHUNK = GRASS_BLADES / GRASS_LAYER_CHUNKS
const GRASS_PATCH_SIZE = 440
const GRASS_PATCH_HALF_SIZE = GRASS_PATCH_SIZE / 2
const GRASS_FADE_START = GRASS_PATCH_HALF_SIZE * 0.64
const GRASS_FADE_END = GRASS_PATCH_HALF_SIZE * 0.98
const FAR_GRASS_BLADES = 120000
const FAR_GRASS_LAYER_CHUNKS = 4
const FAR_GRASS_BLADES_PER_CHUNK = FAR_GRASS_BLADES / FAR_GRASS_LAYER_CHUNKS
const FAR_GRASS_PATCH_SIZE = 900
const FAR_GRASS_PATCH_HALF_SIZE = FAR_GRASS_PATCH_SIZE / 2
const FAR_GRASS_INNER_RADIUS = GRASS_PATCH_HALF_SIZE * 0.55
const HORIZON_GRASS_BLADES = 50000
const HORIZON_GRASS_LAYER_CHUNKS = 2
const HORIZON_GRASS_BLADES_PER_CHUNK = HORIZON_GRASS_BLADES / HORIZON_GRASS_LAYER_CHUNKS
const HORIZON_GRASS_PATCH_SIZE = 1500
const HORIZON_GRASS_PATCH_HALF_SIZE = HORIZON_GRASS_PATCH_SIZE / 2
const HORIZON_GRASS_INNER_RADIUS = FAR_GRASS_PATCH_HALF_SIZE * 0.68
const HEIGHT_MAP_SIZE = 768
const SPAWN_THIN_RADIUS = 18
const MAX_GRASS_DISPLACERS = 12
const GRASS_DISPLACER_RADIUS = 7
const GRASS_DISPLACER_STRENGTH = 1.05
const GRASS_WAKE_RADIUS = 11
const GRASS_WAKE_WIDTH = 4.8
const GRASS_WAKE_STRENGTH = 2
const GRASS_IDLE_FOOTPRINT_STRENGTH = 3
const GRASS_LOCAL_PARTING_STRENGTH = 3

const vertexShader = `
   attribute vec2 aBladeShape;
   attribute vec2 aBladeYaw;
   attribute vec3 aBladeColor;
   attribute vec2 aBladeLocalOffset;
   attribute vec3 aBladeMetrics;

   uniform float uTime;
   uniform vec2 uPlayerPosition;
   uniform sampler2D uHeightMap;
   uniform vec2 uHeightMapTexel;
   uniform float uTerrainMinHeight;
   uniform float uTerrainMaxHeight;
   uniform vec3 uCameraPosition;
   uniform float uPatchSize;
   uniform float uPatchHalfSize;
   uniform float uFadeStart;
   uniform float uFadeEnd;
   uniform float uAlphaScale;
   uniform float uHeightScale;
   uniform float uWidthScale;
   uniform float uMinRadius;
   uniform float uTerrainSampleQuality;
   uniform float uInteractionScale;
   uniform int uDisplacerCount;
   uniform vec3 uDisplacers[${MAX_GRASS_DISPLACERS}];
   uniform vec3 uLocalMotion;

   varying vec3 vColor;
   varying float vTip;
   varying float vAlpha;
   varying float vFogAmount;
   varying float vDisplacement;

   float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
   }

   float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);

      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));

      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
   }

   mat3 rotateAroundAxis(vec3 axis, float angle) {
      axis = normalize(axis);
      float s = sin(angle);
      float c = cos(angle);
      float oc = 1.0 - c;

      return mat3(
         oc * axis.x * axis.x + c,
         oc * axis.x * axis.y - axis.z * s,
         oc * axis.z * axis.x + axis.y * s,
         oc * axis.x * axis.y + axis.z * s,
         oc * axis.y * axis.y + c,
         oc * axis.y * axis.z - axis.x * s,
         oc * axis.z * axis.x - axis.y * s,
         oc * axis.y * axis.z + axis.x * s,
         oc * axis.z * axis.z + c
      );
   }

   float sampleTerrainHeight(vec2 uv) {
      uv = clamp(uv, vec2(0.0), vec2(1.0));

      float height = texture2D(uHeightMap, uv).r;

      if (uTerrainSampleQuality > 0.5) {
         vec2 texel = uHeightMapTexel * 1.25;
         height = max(height, texture2D(uHeightMap, uv + vec2(texel.x, 0.0)).r);
         height = max(height, texture2D(uHeightMap, uv - vec2(texel.x, 0.0)).r);
         height = max(height, texture2D(uHeightMap, uv + vec2(0.0, texel.y)).r);
         height = max(height, texture2D(uHeightMap, uv - vec2(0.0, texel.y)).r);
      }

      if (uTerrainSampleQuality > 1.5) {
         vec2 texel = uHeightMapTexel * 1.75;
         height = max(height, texture2D(uHeightMap, uv + texel).r);
         height = max(height, texture2D(uHeightMap, uv - texel).r);
      }

      return height;
   }

   void main() {
      float worldHalfSize = ${WORLD_HALF_SIZE.toFixed(1)};

      vec2 origin = aBladeLocalOffset;
      origin.x = mod(origin.x - uPlayerPosition.x + uPatchHalfSize, uPatchSize) - uPatchHalfSize;
      origin.y = mod(origin.y - uPlayerPosition.y + uPatchHalfSize, uPatchSize) - uPatchHalfSize;

      vec2 worldXZ = uPlayerPosition + origin;
      float distanceFromPlayer = length(origin);
      float ringFade = smoothstep(uMinRadius, uMinRadius + 70.0, distanceFromPlayer);
      float innerFade = mix(1.0, ringFade, step(0.001, uMinRadius));
      float patchFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distanceFromPlayer);
      float silhouetteFade = 1.0 - smoothstep(uPatchHalfSize * 0.92, uPatchHalfSize, distanceFromPlayer);
      vec2 heightUv = (worldXZ + worldHalfSize) / (worldHalfSize * 2.0);
      float terrainHeight = sampleTerrainHeight(heightUv);
      float worldY = mix(uTerrainMinHeight, uTerrainMaxHeight, terrainHeight) + 0.22;
      float edgeFade =
         smoothstep(-worldHalfSize, -worldHalfSize + 10.0, worldXZ.x) *
         (1.0 - smoothstep(worldHalfSize - 10.0, worldHalfSize, worldXZ.x)) *
         smoothstep(-worldHalfSize, -worldHalfSize + 10.0, worldXZ.y) *
         (1.0 - smoothstep(worldHalfSize - 10.0, worldHalfSize, worldXZ.y));
      float spawnFade = smoothstep(0.0, ${SPAWN_THIN_RADIUS.toFixed(1)}, length(worldXZ));
      float visibility = edgeFade * innerFade * patchFade * silhouetteFade;
      float side = aBladeShape.x;
      float tip = aBladeShape.y;
      float taper = mix(1.0, 0.08, tip);
      float heightNoise = valueNoise(worldXZ * 0.12);
      float clumpNoise = valueNoise(worldXZ * 0.035);
      float fineNoise = valueNoise(worldXZ * 0.43 + aBladeMetrics.z);
      float heightVariation = mix(0.78, 1.32, heightNoise) * mix(0.9, 1.1, fineNoise) * mix(0.92, 1.08, clumpNoise);
      float height = aBladeMetrics.x * uHeightScale * heightVariation * mix(0.26, 1.0, patchFade) * edgeFade * mix(0.18, 1.0, spawnFade);
      float width = aBladeMetrics.y * uWidthScale * taper * mix(0.42, 1.0, patchFade) * mix(0.88, 1.12, fineNoise);

      vec3 basePosition = vec3(worldXZ.x, worldY, worldXZ.y);
      vec3 transformed = basePosition;
      transformed += vec3(aBladeYaw.x, 0.0, aBladeYaw.y) * side * width;
      transformed.y += height * tip;
      vec3 relativePosition = transformed - basePosition;

      vec2 naturalLeanDirection = vec2(
         valueNoise(worldXZ * 0.08 + aBladeMetrics.z * 0.13) - 0.48,
         valueNoise(worldXZ.yx * 0.08 - aBladeMetrics.z * 0.17) - 0.52
      );
      naturalLeanDirection = normalize(naturalLeanDirection + vec2(0.001, -0.002));
      float naturalLean = radians(mix(3.0, 14.0, clumpNoise) * mix(0.45, 1.0, fineNoise)) * pow(tip, 1.42);
      vec3 naturalLeanAxis = normalize(vec3(naturalLeanDirection.y, 0.0, -naturalLeanDirection.x));
      relativePosition = rotateAroundAxis(naturalLeanAxis, naturalLean) * relativePosition;

      float displacementAmount = 0.0;
      vec2 displacementDirection = vec2(0.0);
      vec2 localForward = normalize(uLocalMotion.xy + vec2(0.001, -0.002));
      vec2 localRight = vec2(-localForward.y, localForward.x);
      float localSpeedFade = smoothstep(0.25, 7.0, uLocalMotion.z);

      if (uInteractionScale > 0.01) {
         for (int i = 0; i < ${MAX_GRASS_DISPLACERS}; i++) {
            if (i >= uDisplacerCount) {
               break;
            }

            vec2 fromPlayer = worldXZ - uDisplacers[i].xy;
            float radius = uDisplacers[i].z;
            float distanceToPlayer = length(fromPlayer);
            float influence = 1.0 - smoothstep(radius * 0.08, radius, distanceToPlayer);
            float leanInfluence = 0.0;
            vec2 leanDirection = normalize(fromPlayer + vec2(0.001, -0.002));

            if (i == 0) {
               float forwardDistance = dot(fromPlayer, localForward);
               float sideDistance = dot(fromPlayer, localRight);
               vec2 leftFoot = vec2(forwardDistance * 1.25, (sideDistance - 0.82) * 0.72);
               vec2 rightFoot = vec2(forwardDistance * 1.25, (sideDistance + 0.82) * 0.72);
               float leftFootInfluence = 1.0 - smoothstep(0.65, 2.45, length(leftFoot));
               float rightFootInfluence = 1.0 - smoothstep(0.65, 2.45, length(rightFoot));
               float footprintInfluence = max(leftFootInfluence, rightFootInfluence);
               float bodyLengthFade = 1.0 - smoothstep(1.25, radius * 0.82, abs(forwardDistance));
               float bodyWidthFade = 1.0 - smoothstep(0.35, 3.15, abs(sideDistance));
               float sidePartingInfluence = bodyLengthFade * bodyWidthFade * mix(0.38, 1.0, localSpeedFade) * ${GRASS_LOCAL_PARTING_STRENGTH.toFixed(2)};
               float softBodyInfluence = smoothstep(0.08, 0.96, influence) * mix(0.18, 0.3, localSpeedFade);
               float footPressure = footprintInfluence * mix(0.9, 0.42, localSpeedFade) * ${GRASS_IDLE_FOOTPRINT_STRENGTH.toFixed(2)};
               float sideSign = mix(-1.0, 1.0, step(0.0, sideDistance));

               leanInfluence = max(max(softBodyInfluence, footPressure), sidePartingInfluence);
               leanDirection = normalize(
                  localForward * (softBodyInfluence * 0.85 + footPressure * 0.22) +
                  localRight * sideSign * sidePartingInfluence * 1.55 +
                  localRight * ((leftFootInfluence - rightFootInfluence) * footPressure * 1.4) +
                  leanDirection * softBodyInfluence * 0.22 +
                  vec2(0.001, -0.002)
               );
            } else {
               leanInfluence = smoothstep(0.05, 0.96, influence) * 0.64;
            }

            if (distanceToPlayer > 0.001) {
               displacementDirection += leanDirection * leanInfluence;
            }

            displacementAmount = max(displacementAmount, leanInfluence);
         }

         if (uLocalMotion.z > 0.01) {
            vec2 motionDirection = normalize(uLocalMotion.xy);
            vec2 fromLocalPlayer = worldXZ - uPlayerPosition;
            float behindPlayer = dot(fromLocalPlayer, -motionDirection);
            float sideDistance = abs(dot(fromLocalPlayer, vec2(-motionDirection.y, motionDirection.x)));
            float trailFade = smoothstep(-1.5, 1.0, behindPlayer) *
               (1.0 - smoothstep(${(GRASS_WAKE_RADIUS * 0.58).toFixed(1)}, ${GRASS_WAKE_RADIUS.toFixed(1)}, behindPlayer)) *
               (1.0 - smoothstep(${(GRASS_WAKE_WIDTH * 0.45).toFixed(1)}, ${GRASS_WAKE_WIDTH.toFixed(1)}, sideDistance));
            float speedFade = smoothstep(0.35, 8.0, uLocalMotion.z);
            float wakeInfluence = trailFade * speedFade;

            displacementDirection += motionDirection * wakeInfluence * ${GRASS_WAKE_STRENGTH.toFixed(2)};
            displacementAmount = max(displacementAmount, wakeInfluence * 0.72);
         }

         displacementAmount *= uInteractionScale;
      }

      float displacementTip = pow(tip, 1.25);

      if (length(displacementDirection) > 0.001) {
         displacementDirection = normalize(displacementDirection);
         vec3 displacementAxis = normalize(vec3(displacementDirection.y, 0.0, -displacementDirection.x));
         float displacementBend = radians(-58.0) * displacementAmount * ${GRASS_DISPLACER_STRENGTH.toFixed(2)} * displacementTip;
         relativePosition = rotateAroundAxis(displacementAxis, displacementBend) * relativePosition;
         relativePosition.y *= mix(1.0, 0.88, displacementAmount * displacementTip);
      }

      vec2 windDirection = normalize(vec2(0.72, 0.42));
      float windNoiseA = valueNoise(worldXZ * 0.045 + windDirection * uTime * 0.42 + aBladeMetrics.z);
      float windNoiseB = valueNoise(worldXZ.yx * 0.115 - windDirection * uTime * 0.28 + aBladeMetrics.z * 0.37);
      float gust = sin(uTime * 1.25 + worldXZ.x * 0.025 + worldXZ.y * 0.04 + aBladeMetrics.z) * 0.5 + 0.5;
      float bend = radians(mix(-18.0, 22.0, windNoiseA) + (windNoiseB - 0.5) * 18.0 + gust * 10.0) * tip;
      vec3 bendAxis = normalize(vec3(windDirection.y + windNoiseB * 0.35, 0.0, -windDirection.x + windNoiseA * 0.35));

      relativePosition = rotateAroundAxis(bendAxis, bend) * relativePosition;
      transformed = basePosition + relativePosition;

      vTip = tip;
      vAlpha = smoothstep(0.04, 0.75, visibility) * uAlphaScale;
      vDisplacement = displacementAmount * displacementTip;
      vColor = aBladeColor * mix(vec3(0.38, 0.44, 0.34), vec3(0.72, 0.82, 0.58), tip) * visibility;
      vFogAmount = smoothstep(50.0, 300.0, distance(uCameraPosition, transformed));

      vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
      gl_Position = projectionMatrix * mvPosition;
   }
`

const fragmentShader = `
   varying vec3 vColor;
   varying float vTip;
   varying float vAlpha;
   varying float vFogAmount;
   varying float vDisplacement;

   void main() {
      if (vAlpha < 0.02) {
         discard;
      }

      vec3 color = vColor;
      color += vec3(0.004, 0.01, 0.002) * smoothstep(0.45, 1.0, vTip);
      color *= mix(1.0, 0.62, vDisplacement);
      color = mix(color, vec3(0.0), vFogAmount);
      gl_FragColor = vec4(color, vAlpha);
   }
`

function random(seed: number) {
   const n = Math.sin(seed * 12.9898) * 43758.5453
   return n - Math.floor(n)
}

function createHeightMapTexture() {
   const noise2D = createTerrainNoise()
   const heights = new Float32Array(HEIGHT_MAP_SIZE * HEIGHT_MAP_SIZE)
   let minHeight = Infinity
   let maxHeight = -Infinity

   for (let z = 0; z < HEIGHT_MAP_SIZE; z++) {
      for (let x = 0; x < HEIGHT_MAP_SIZE; x++) {
         const worldX = (x / (HEIGHT_MAP_SIZE - 1)) * WORLD_HALF_SIZE * 2 - WORLD_HALF_SIZE
         const worldZ = (z / (HEIGHT_MAP_SIZE - 1)) * WORLD_HALF_SIZE * 2 - WORLD_HALF_SIZE
         const height = getTerrainHeightAtWorld(worldX, worldZ, noise2D)
         const index = z * HEIGHT_MAP_SIZE + x

         heights[index] = height
         minHeight = Math.min(minHeight, height)
         maxHeight = Math.max(maxHeight, height)
      }
   }

   const pixels = new Uint8Array(HEIGHT_MAP_SIZE * HEIGHT_MAP_SIZE * 4)

   for (let index = 0; index < heights.length; index++) {
      const normalizedHeight = Math.round(((heights[index] - minHeight) / (maxHeight - minHeight)) * 255)
      const pixelIndex = index * 4

      pixels[pixelIndex] = normalizedHeight
      pixels[pixelIndex + 1] = normalizedHeight
      pixels[pixelIndex + 2] = normalizedHeight
      pixels[pixelIndex + 3] = 255
   }

   const texture = new DataTexture(pixels, HEIGHT_MAP_SIZE, HEIGHT_MAP_SIZE, RGBAFormat, UnsignedByteType)
   texture.needsUpdate = true
   texture.minFilter = LinearFilter
   texture.magFilter = LinearFilter
   texture.wrapS = ClampToEdgeWrapping
   texture.wrapT = ClampToEdgeWrapping

   return { texture, minHeight, maxHeight }
}

function createGrassGeometry(bladeCount: number, patchHalfSize: number, seedOffset = 0) {
   const positions = new Float32Array(3 * 3)
   const bladeShapes = new Float32Array([
      -1, 0,
      1, 0,
      0, 1,
   ])
   const bladeYaws = new Float32Array(bladeCount * 2)
   const bladeColors = new Float32Array(bladeCount * 3)
   const bladeLocalOffsets = new Float32Array(bladeCount * 2)
   const bladeMetrics = new Float32Array(bladeCount * 3)
   const greens = [
      [0.11, 0.3, 0.16],
      [0.18, 0.38, 0.18],
      [0.27, 0.43, 0.23],
      [0.08, 0.24, 0.14],
   ]

   const columns = Math.ceil(Math.sqrt(bladeCount))
   const rows = Math.ceil(bladeCount / columns)
   const cellWidth = (patchHalfSize * 2) / columns
   const cellDepth = (patchHalfSize * 2) / rows

   for (let blade = 0; blade < bladeCount; blade++) {
      const seed = blade + seedOffset
      const column = blade % columns
      const row = Math.floor(blade / columns)
      const jitterX = random(seed + 10)
      const jitterZ = random(seed + 20)
      const patch = Math.pow(random(seed + 90), 2.4)
      const patchAngle = random(seed + 100) * Math.PI * 2
      const x = -patchHalfSize + (column + jitterX) * cellWidth + Math.cos(patchAngle * 2.7) * patch * 1.8
      const z = -patchHalfSize + (row + jitterZ) * cellDepth + Math.sin(patchAngle * 2.3) * patch * 1.8
      const yaw = random(seed + 30) * Math.PI * 2
      const yawX = Math.sin(yaw)
      const yawZ = -Math.cos(yaw)
      const height = 3 + random(seed + 40) * 2
      const width = 0.055 + random(seed + 50) * 0.085
      const color = greens[Math.floor(random(seed + 60) * greens.length)]
      const colorMix = random(seed + 70)
      const windPhase = random(seed + 80) * 60
      const vectorOffset = blade * 3
      const offsetOffset = blade * 2

      bladeLocalOffsets[offsetOffset] = x
      bladeLocalOffsets[offsetOffset + 1] = z

      bladeYaws[offsetOffset] = yawX
      bladeYaws[offsetOffset + 1] = yawZ

      bladeColors[vectorOffset] = color[0] + colorMix * 0.08
      bladeColors[vectorOffset + 1] = color[1] + colorMix * 0.12
      bladeColors[vectorOffset + 2] = color[2]

      bladeMetrics[vectorOffset] = height
      bladeMetrics[vectorOffset + 1] = width
      bladeMetrics[vectorOffset + 2] = windPhase
   }

   const geometry = new InstancedBufferGeometry()
   geometry.setAttribute('position', new BufferAttribute(positions, 3))
   geometry.setAttribute('aBladeShape', new BufferAttribute(bladeShapes, 2))
   geometry.setAttribute('aBladeYaw', new InstancedBufferAttribute(bladeYaws, 2))
   geometry.setAttribute('aBladeColor', new InstancedBufferAttribute(bladeColors, 3))
   geometry.setAttribute('aBladeLocalOffset', new InstancedBufferAttribute(bladeLocalOffsets, 2))
   geometry.setAttribute('aBladeMetrics', new InstancedBufferAttribute(bladeMetrics, 3))
   geometry.instanceCount = bladeCount
   geometry.computeBoundingSphere()

   return geometry
}

type HeightMap = ReturnType<typeof createHeightMapTexture>

function scheduleGrassLayer(callback: () => void, timeout: number) {
   const requestIdleCallback = window.requestIdleCallback

   if (requestIdleCallback) {
      const handle = requestIdleCallback(callback, { timeout })
      return () => window.cancelIdleCallback(handle)
   }

   const handle = window.setTimeout(callback, timeout)
   return () => window.clearTimeout(handle)
}

interface GrassLayerProps {
   bladeCount: number
   seedOffset: number
   patchSize: number
   fadeStart: number
   fadeEnd: number
   heightMap: HeightMap
   displacers: Vector3[]
   displacerCountRef: React.MutableRefObject<number>
   localMotion: Vector3
   minRadius?: number
   alphaScale?: number
   heightScale?: number
   widthScale?: number
   terrainSampleQuality?: number
   interactionScale?: number
   renderOrder?: number
}

const GrassLayer: React.FC<GrassLayerProps> = ({
   bladeCount,
   seedOffset,
   patchSize,
   fadeStart,
   fadeEnd,
   heightMap,
   displacers,
   displacerCountRef,
   localMotion,
   minRadius = 0,
   alphaScale = 1,
   heightScale = 1,
   widthScale = 1,
   terrainSampleQuality = 2,
   interactionScale = 1,
   renderOrder = 0,
}) => {
   const materialRef = useRef<ShaderMaterial>(null!)
   const patchHalfSize = patchSize / 2
   const grass = useMemo(() => createGrassGeometry(bladeCount, patchHalfSize, seedOffset), [
      bladeCount,
      patchHalfSize,
      seedOffset,
   ])
   const playerPosition = useMemo(() => new Vector2(0, 0), [])
   const cameraPosition = useMemo(() => new Vector3(0, 0, 0), [])
   const uniforms = useMemo(
      () => ({
         uTime: { value: 0 },
         uPlayerPosition: { value: playerPosition },
         uHeightMap: { value: heightMap.texture },
         uHeightMapTexel: { value: new Vector2(1 / HEIGHT_MAP_SIZE, 1 / HEIGHT_MAP_SIZE) },
         uTerrainMinHeight: { value: heightMap.minHeight },
         uTerrainMaxHeight: { value: heightMap.maxHeight },
         uCameraPosition: { value: cameraPosition },
         uPatchSize: { value: patchSize },
         uPatchHalfSize: { value: patchHalfSize },
         uFadeStart: { value: fadeStart },
         uFadeEnd: { value: fadeEnd },
         uAlphaScale: { value: alphaScale },
         uHeightScale: { value: heightScale },
         uWidthScale: { value: widthScale },
         uMinRadius: { value: minRadius },
         uTerrainSampleQuality: { value: terrainSampleQuality },
         uInteractionScale: { value: interactionScale },
         uDisplacerCount: { value: 0 },
         uDisplacers: { value: displacers },
         uLocalMotion: { value: localMotion },
      }),
      [
         alphaScale,
         cameraPosition,
         fadeEnd,
         fadeStart,
         displacerCountRef,
         displacers,
         heightMap,
         heightScale,
         interactionScale,
         localMotion,
         minRadius,
         patchHalfSize,
         patchSize,
         playerPosition,
         terrainSampleQuality,
         widthScale,
      ]
   )

   useFrame((state) => {
      if (materialRef.current) {
         materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
      }

      const controlsTarget = state.controls?.target
      playerPosition.set(controlsTarget?.x ?? state.camera.position.x, controlsTarget?.z ?? state.camera.position.z)

      if (materialRef.current) {
         cameraPosition.copy(state.camera.position)
         materialRef.current.uniforms.uDisplacerCount.value = displacerCountRef.current
         materialRef.current.uniforms.uDisplacers.value = displacers
         materialRef.current.uniforms.uLocalMotion.value = localMotion
         materialRef.current.uniforms.uTerrainSampleQuality.value = terrainSampleQuality
         materialRef.current.uniforms.uInteractionScale.value = interactionScale
      }
   })

   return (
      <mesh frustumCulled={false} renderOrder={renderOrder}>
         <primitive object={grass} attach="geometry" />
         <shaderMaterial
            ref={materialRef}
            uniforms={uniforms}
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            side={DoubleSide}
            transparent={true}
            depthWrite={false}
         />
      </mesh>
   )
}

const Grass: React.FC = () => {
   const [visibleLayerCount, setVisibleLayerCount] = useState(0)
   const shouldCreateGrass = visibleLayerCount > 0
   const heightMap = useMemo(() => (shouldCreateGrass ? createHeightMapTexture() : null), [shouldCreateGrass])
   const displacerCountRef = useRef(0)
   const displacers = useMemo(
      () => Array.from({ length: MAX_GRASS_DISPLACERS }, () => new Vector3(0, 0, GRASS_DISPLACER_RADIUS)),
      []
   )
   const localMotion = useMemo(() => new Vector3(0, 0, 0), [])
   const lastLocalPosition = useRef(new Vector2(0, 0))
   const lastLocalDirection = useRef(new Vector2(0.72, 0.42).normalize())
   const currentLocalVelocity = useRef(new Vector2(0, 0))
   const smoothedLocalVelocity = useRef(new Vector2(0, 0))
   const hasLastLocalPosition = useRef(false)

   useEffect(() => {
      const totalLayers = GRASS_LAYER_CHUNKS + FAR_GRASS_LAYER_CHUNKS + HORIZON_GRASS_LAYER_CHUNKS
      const cleanups = Array.from({ length: totalLayers }, (_, index) =>
         scheduleGrassLayer(() => setVisibleLayerCount((count) => Math.max(count, index + 1)), 140 + index * 180)
      )

      return () => {
         cleanups.forEach((cleanup) => cleanup())
      }
   }, [])

   useFrame((state, delta) => {
      const controlsTarget = state.controls?.target
      const localX = controlsTarget?.x ?? state.camera.position.x
      const localZ = controlsTarget?.z ?? state.camera.position.z
      let count = 0

      displacers[count].set(localX, localZ, GRASS_DISPLACER_RADIUS)
      count++

      if (!hasLastLocalPosition.current) {
         lastLocalPosition.current.set(localX, localZ)
         hasLastLocalPosition.current = true
         localMotion.set(lastLocalDirection.current.x, lastLocalDirection.current.y, 0)
      } else {
         const safeDelta = Math.max(delta, 1 / 120)
         currentLocalVelocity.current.set(
            (localX - lastLocalPosition.current.x) / safeDelta,
            (localZ - lastLocalPosition.current.y) / safeDelta
         )
         const currentSpeed = currentLocalVelocity.current.length()
         const smoothedSpeed = smoothedLocalVelocity.current.length()
         const velocityLerp = currentSpeed > smoothedSpeed ? delta * 12 : delta * 3.5

         smoothedLocalVelocity.current.lerp(currentLocalVelocity.current, Math.min(1, velocityLerp))

         const speed = smoothedLocalVelocity.current.length()

         if (speed > 0.05) {
            lastLocalDirection.current.set(smoothedLocalVelocity.current.x / speed, smoothedLocalVelocity.current.y / speed)
            localMotion.set(lastLocalDirection.current.x, lastLocalDirection.current.y, speed)
         } else {
            localMotion.set(lastLocalDirection.current.x, lastLocalDirection.current.y, 0)
         }

         lastLocalPosition.current.set(localX, localZ)
      }

      for (const player of usePlayerPositionsStore.getState().playerPositions.values()) {
         if (count >= MAX_GRASS_DISPLACERS) {
            break
         }

         displacers[count].set(player.targetPosition.x, player.targetPosition.z, GRASS_DISPLACER_RADIUS)
         count++
      }

      displacerCountRef.current = count
   })

   if (!heightMap) {
      return null
   }

   return (
      <>
         {Array.from({ length: FAR_GRASS_LAYER_CHUNKS }, (_, chunkIndex) =>
            visibleLayerCount >= GRASS_LAYER_CHUNKS + chunkIndex + 1 ? (
               <GrassLayer
                  key={`far-${chunkIndex}`}
                  bladeCount={FAR_GRASS_BLADES_PER_CHUNK}
                  seedOffset={4000000 + chunkIndex * FAR_GRASS_BLADES_PER_CHUNK}
                  patchSize={FAR_GRASS_PATCH_SIZE}
                  fadeStart={FAR_GRASS_PATCH_HALF_SIZE * 0.56}
                  fadeEnd={FAR_GRASS_PATCH_HALF_SIZE * 0.98}
                  minRadius={FAR_GRASS_INNER_RADIUS}
                  alphaScale={0.55}
                  heightScale={0.72}
                  widthScale={0.85}
                  terrainSampleQuality={1}
                  interactionScale={0}
                  heightMap={heightMap}
                  displacers={displacers}
                  displacerCountRef={displacerCountRef}
                  localMotion={localMotion}
                  renderOrder={1}
               />
            ) : null
         )}
         {Array.from({ length: HORIZON_GRASS_LAYER_CHUNKS }, (_, chunkIndex) =>
            visibleLayerCount >= GRASS_LAYER_CHUNKS + FAR_GRASS_LAYER_CHUNKS + chunkIndex + 1 ? (
               <GrassLayer
                  key={`horizon-${chunkIndex}`}
                  bladeCount={HORIZON_GRASS_BLADES_PER_CHUNK}
                  seedOffset={6000000 + chunkIndex * HORIZON_GRASS_BLADES_PER_CHUNK}
                  patchSize={HORIZON_GRASS_PATCH_SIZE}
                  fadeStart={HORIZON_GRASS_PATCH_HALF_SIZE * 0.42}
                  fadeEnd={HORIZON_GRASS_PATCH_HALF_SIZE * 0.98}
                  minRadius={HORIZON_GRASS_INNER_RADIUS}
                  alphaScale={0.28}
                  heightScale={0.42}
                  widthScale={0.72}
                  terrainSampleQuality={0}
                  interactionScale={0}
                  heightMap={heightMap}
                  displacers={displacers}
                  displacerCountRef={displacerCountRef}
                  localMotion={localMotion}
                  renderOrder={0}
               />
            ) : null
         )}
         {Array.from({ length: GRASS_LAYER_CHUNKS }, (_, chunkIndex) =>
            visibleLayerCount >= 1 + chunkIndex ? (
               <GrassLayer
                  key={`near-${chunkIndex}`}
                  bladeCount={GRASS_BLADES_PER_CHUNK}
                  seedOffset={chunkIndex * GRASS_BLADES_PER_CHUNK}
                  patchSize={GRASS_PATCH_SIZE}
                  fadeStart={GRASS_FADE_START}
                  fadeEnd={GRASS_FADE_END}
                  terrainSampleQuality={2}
                  interactionScale={1}
                  heightMap={heightMap}
                  displacers={displacers}
                  displacerCountRef={displacerCountRef}
                  localMotion={localMotion}
                  renderOrder={2}
               />
            ) : null
         )}
      </>
   )
}

export default Grass
