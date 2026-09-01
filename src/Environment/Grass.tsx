import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
   BufferAttribute,
   ClampToEdgeWrapping,
   DataTexture,
   DoubleSide,
   Frustum,
   InstancedBufferAttribute,
   InstancedBufferGeometry,
   LinearFilter,
   Matrix4,
   RepeatWrapping,
   RGBAFormat,
   ShaderMaterial,
   Sphere,
   UnsignedByteType,
   Vector2,
   Vector3,
   Vector4,
} from 'three'
import { MOONLIGHT_OFFSET, WORLD_HALF_SIZE } from '../constants'
import { isHandheldDevice } from '../Utils/isHandheldDevice'
import { FOG_FAR, FOG_NEAR } from './sceneQuality'
import { usePlayerPositionsStore } from '../State/playerPositionsStore'
import { createTerrainNoise, fbm, getTerrainHeightAtWorld } from './terrain'
import { createTrampleField } from './TrampleField'

const NEAR_PATCH_SIZE = 400
const NEAR_PATCH_HALF_SIZE = NEAR_PATCH_SIZE / 2
const NEAR_FADE_START = NEAR_PATCH_HALF_SIZE * 0.66
const NEAR_FADE_END = NEAR_PATCH_HALF_SIZE * 0.99

const FAR_PATCH_SIZE = 640
// The far ring reaches full strength at FAR_INNER_RADIUS + FAR_INNER_RAMP, which must land
// before the near patch starts fading. Otherwise there is a band where the near layer is
// thinning out and the far layer has not arrived yet, and that band reads as the visible
// edge of the lawn - especially looking down from a high camera.
const FAR_INNER_RADIUS = 60
const FAR_INNER_RAMP = 60
const FAR_FADE_START = FOG_FAR * 0.7
const FAR_FADE_END = FOG_FAR

const SPAWN_THIN_RADIUS = 18

// How far over a blade goes when it is shouldered aside, and when it is stood on. A full push
// is a right angle on purpose: paired with the peaked profile in the shader it puts the middle
// of the blade flat on the floor, which is what lets the tip read as lifting back up rather
// than as the whole stem simply leaning. Crushing goes past that, and squashes what is left of
// the height with it - the difference between grass brushed aside and grass flattened.
const GRASS_BEND_ANGLE = 90
const GRASS_CRUSH_ANGLE = 93
const GRASS_BEND_SQUASH = 0.58
const GRASS_CRUSH_SQUASH = 0.34

const WIND_MAP_SIZE = 256
const WIND_SWAY_WORLD_SCALE = 0.0125
const WIND_GUST_WORLD_SCALE = 0.0034
// Scroll rates are in uv/second; divided by the world scale above they are the speed the wind
// actually travels across the meadow. The shipped value-noise wind moved at ~9.3 units/second,
// and anything much slower than that reads as a still field rather than a breeze.
const WIND_SWAY_SCROLL = WIND_SWAY_WORLD_SCALE * 9.2
const WIND_GUST_SCROLL = WIND_GUST_WORLD_SCALE * 8.8
// Per-blade offset into the sway lookup, in uv per unit of the blade's stored phase (0..60).
const WIND_SWAY_BLADE_JITTER = 0.003

// Matches the directional light in Environment/Lighting.
const SUN_DIRECTION = new Vector3(...MOONLIGHT_OFFSET).normalize()

interface QualityProfile {
   nearBlades: number
   nearChunks: number
   farBlades: number
   farChunks: number
   bladeSegments: number
   bladeWidthScale: number
   bladeHeightScale: number
   fieldMapSize: number
   trampleMapSize: number
   minDensity: number
   targetFrameTime: number
}

const DESKTOP_QUALITY: QualityProfile = {
   nearBlades: 520000,
   nearChunks: 8,
   farBlades: 180000,
   farChunks: 3,
   bladeSegments: 2,
   bladeWidthScale: 1,
   bladeHeightScale: 1,
   fieldMapSize: 768,
   trampleMapSize: 640,
   minDensity: 0.5,
   targetFrameTime: 1 / 58,
}

// Mobile cannot afford desktop's blade count, so it buys coverage with blade size instead:
// fewer, wider, slightly taller blades fill the same ground for a fraction of the vertex work.
// Width is close to free - it costs nothing per vertex - whereas every extra blade is another
// instance to transform.
const MOBILE_QUALITY: QualityProfile = {
   nearBlades: 300000,
   nearChunks: 6,
   farBlades: 90000,
   farChunks: 2,
   bladeSegments: 1,
   bladeWidthScale: 1.34,
   bladeHeightScale: 1.06,
   fieldMapSize: 512,
   trampleMapSize: 320,
   minDensity: 0.4,
   targetFrameTime: 1 / 50,
}

// The adaptive density loop below absorbs whatever this one-shot guess gets wrong.
function detectQualityProfile(): QualityProfile {
   return isHandheldDevice() ? MOBILE_QUALITY : DESKTOP_QUALITY
}

const glsl = {
   worldHalfSize: WORLD_HALF_SIZE.toFixed(1),
   spawnThinRadius: SPAWN_THIN_RADIUS.toFixed(1),
   bendAngle: GRASS_BEND_ANGLE.toFixed(1),
   crushAngle: GRASS_CRUSH_ANGLE.toFixed(1),
   bendSquash: GRASS_BEND_SQUASH.toFixed(2),
   crushSquash: GRASS_CRUSH_SQUASH.toFixed(2),
   swayScale: WIND_SWAY_WORLD_SCALE.toFixed(5),
   gustScale: WIND_GUST_WORLD_SCALE.toFixed(5),
   swayScroll: WIND_SWAY_SCROLL.toFixed(5),
   gustScroll: WIND_GUST_SCROLL.toFixed(5),
   swayJitter: WIND_SWAY_BLADE_JITTER.toFixed(5),
   fogNear: FOG_NEAR.toFixed(1),
   fogFar: FOG_FAR.toFixed(1),
   innerRamp: FAR_INNER_RAMP.toFixed(1),
}

const vertexShader = `
   attribute vec2 aBladeShape;
   attribute vec2 aBladeYaw;
   attribute vec3 aBladeColor;
   attribute vec2 aBladeLocalOffset;
   attribute vec4 aBladeMetrics;

   uniform float uTime;
   uniform vec2 uPlayerPosition;
   uniform sampler2D uFieldMap;
   uniform sampler2D uWindMap;
   uniform float uTerrainMinHeight;
   uniform float uTerrainMaxHeight;
   uniform float uTerrainMidHeight;
   uniform vec3 uCameraPosition;
   uniform vec3 uSunDirection;
   uniform vec4 uFrustumPlanes[6];
   uniform vec2 uWindDirection;
   uniform float uCullRadius;
   uniform float uPatchSize;
   uniform float uPatchHalfSize;
   uniform float uFadeStart;
   uniform float uFadeEnd;
   uniform float uMinRadius;
   uniform float uAlphaScale;
   uniform float uHeightScale;
   uniform float uWidthScale;
   uniform float uWindScale;
   uniform float uDensityScale;
   uniform float uInteractionScale;
   uniform sampler2D uTrampleMap;
   // xy - centre of the trample window in world space, z - one over its world size.
   uniform vec3 uTrampleWindow;

   varying vec3 vColor;
   varying float vAlpha;
   varying float vFog;
   varying float vHash;

   mat3 rotateAroundAxis(vec3 axis, float angle) {
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

   bool outsideFrustum(vec3 center, float radius) {
      for (int i = 0; i < 6; i++) {
         if (dot(uFrustumPlanes[i].xyz, center) + uFrustumPlanes[i].w < -radius) {
            return true;
         }
      }

      return false;
   }

   void main() {
      float worldHalfSize = ${glsl.worldHalfSize};

      // Blades sit on a fixed world lattice; the modulo picks the lattice copy nearest the
      // player, so a blade holds its world position and only jumps a whole patch at a time.
      vec2 origin = aBladeLocalOffset;
      origin.x = mod(origin.x - uPlayerPosition.x + uPatchHalfSize, uPatchSize) - uPatchHalfSize;
      origin.y = mod(origin.y - uPlayerPosition.y + uPatchHalfSize, uPatchSize) - uPatchHalfSize;

      vec2 worldXZ = uPlayerPosition + origin;

      // Everything above is about fifteen instructions. A blade that fails either rejection
      // below costs only that: no texture fetches, no wind, no bending, no lighting. The
      // camera only ever faces a fraction of the patch, so most blades stop here.
      if (outsideFrustum(vec3(worldXZ.x, uTerrainMidHeight, worldXZ.y), uCullRadius)) {
         gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
         return;
      }

      float distanceFromPlayer = length(origin);
      float ringFade = smoothstep(uMinRadius, uMinRadius + ${glsl.innerRamp}, distanceFromPlayer);
      float innerFade = mix(1.0, ringFade, step(0.001, uMinRadius));
      float patchFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distanceFromPlayer);
      float edgeFade =
         smoothstep(-worldHalfSize, -worldHalfSize + 10.0, worldXZ.x) *
         (1.0 - smoothstep(worldHalfSize - 10.0, worldHalfSize, worldXZ.x)) *
         smoothstep(-worldHalfSize, -worldHalfSize + 10.0, worldXZ.y) *
         (1.0 - smoothstep(worldHalfSize - 10.0, worldHalfSize, worldXZ.y));
      float visibility = edgeFade * innerFade * patchFade;

      if (visibility < 0.015) {
         gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
         return;
      }

      // One fetch replaces the old seven-tap terrain max filter and four value-noise octaves:
      // R is the pre-dilated terrain height, GBA are baked clump / lushness / lean fields.
      vec2 fieldUv = (worldXZ + worldHalfSize) / (worldHalfSize * 2.0);
      vec4 field = texture2D(uFieldMap, fieldUv);
      float terrainHeight = field.r;
      float clump = field.g;
      float lush = field.b;
      float leanAngle = field.a * 6.2831853;

      float spawnFade = smoothstep(0.0, ${glsl.spawnThinRadius}, length(worldXZ));
      float worldY = mix(uTerrainMinHeight, uTerrainMaxHeight, terrainHeight) + 0.22;
      float side = aBladeShape.x;
      float t = aBladeShape.y;
      float taper = sqrt(max(0.0, 1.0 - t));
      float bladeHash = aBladeMetrics.w;

      float heightVariation = mix(0.74, 1.34, lush) * mix(0.92, 1.08, clump) * mix(0.9, 1.1, bladeHash);
      float height = aBladeMetrics.x * uHeightScale * heightVariation * mix(0.45, 1.0, patchFade) * edgeFade *
         mix(0.18, 1.0, spawnFade);
      // Thinning the field must not thin its coverage, so blades widen as density drops.
      float width = aBladeMetrics.y * uWidthScale * taper * mix(0.68, 1.0, patchFade) *
         mix(0.88, 1.12, bladeHash) * mix(1.26, 1.0, uDensityScale);

      // Everything a player has done to this patch of ground, in one fetch. The trample map is
      // written once per frame for every player at once, so this costs the same whether there
      // is one person in the meadow or fifty, and the loop over displacers it replaces is gone.
      // Blades outside the window read nothing and skip the fetch entirely.
      float trampleBend = 0.0;
      float trampleCrush = 0.0;
      vec2 trampleDirection = vec2(0.0);

      if (uInteractionScale > 0.01) {
         vec2 trampleUv = (worldXZ - uTrampleWindow.xy) * uTrampleWindow.z + 0.5;
         vec2 trampleEdge = min(trampleUv, 1.0 - trampleUv);
         float windowFade = smoothstep(0.0, 0.04, min(trampleEdge.x, trampleEdge.y)) * uInteractionScale;

         if (windowFade > 0.0) {
            vec4 trample = texture2D(uTrampleMap, trampleUv);

            // Opposing channels cancel to the net push; whatever was added to all four equally
            // had no direction at all, and that is the weight of a foot rather than a shoulder.
            vec2 push = vec2(trample.r - trample.g, trample.b - trample.a);
            float pushLength = length(push);

            trampleDirection = push / max(pushLength, 0.0001);
            trampleBend = pushLength * windowFade;
            trampleCrush = min(min(trample.r, trample.g), min(trample.b, trample.a)) * windowFade;
         }
      }

      // Wind is two scrolling taps of a tiling noise texture: fine sway riding on slow gust
      // fronts that roll coherently across the meadow, in place of eight sin() calls per
      // vertex. The scroll rates matter more than the amplitudes - the field only reads as
      // breezy if the pattern actually travels across it at walking pace or better.
      // Offsetting the sway lookup per blade stops neighbours moving as one rigid sheet while
      // still leaving them broadly correlated, so the gust fronts survive but the field
      // shimmers up close.
      vec2 swayUv = worldXZ * ${glsl.swayScale} - uWindDirection * uTime * ${glsl.swayScroll} +
         aBladeMetrics.z * ${glsl.swayJitter};
      vec2 gustUv = worldXZ * ${glsl.gustScale} - uWindDirection * uTime * ${glsl.gustScroll};
      float sway = texture2D(uWindMap, swayUv).r - 0.5;
      float gust = smoothstep(0.3, 0.85, texture2D(uWindMap, gustUv).g);
      float flutter = sin(uTime * 2.6 + aBladeMetrics.z) * 0.32;

      vec2 leanDirection = vec2(cos(leanAngle), sin(leanAngle));
      float leanStrength = radians(mix(3.0, 15.0, clump));
      // A blade that is already pressed flat has nothing left for the wind to move, which is
      // what stops a fresh trail from shimmering in the breeze like the field around it.
      float windStrength = radians(29.0) * (sway * 1.6 + gust * 0.9 + flutter) * uWindScale *
         (1.0 - 0.8 * max(trampleCrush, trampleBend * 0.6));
      vec2 windDirection = uWindDirection + vec2(-uWindDirection.y, uWindDirection.x) * sway * 0.8;

      // Natural droop and wind used to be two separate axis rotations. Folding them into one
      // removes a whole matrix build per vertex, but it has to be done as a vector sum: taking
      // the angle as leanStrength + windStrength flips the blade back the way it came whenever
      // the sway goes negative, because the direction has already flipped. The magnitude of
      // the combined vector is the angle, and its normal is the direction.
      vec2 bendVector = windDirection * windStrength + leanDirection * leanStrength;
      float bendAngle = length(bendVector);
      vec2 bendDirection = bendVector / max(bendAngle, 0.0001);

      // Rotating each vertex by an angle that grows along the blade bends it into an arc
      // rather than tipping it rigidly, which is what gives multi-segment blades a real
      // curved silhouette. A single-segment blade collapses to the old rigid behaviour.
      float curveT = t * (0.45 + 0.55 * t);
      float displacementAmount = max(trampleBend, trampleCrush);

      // Wind curls a blade over from the tip down, so it gets a square profile that leaves the
      // base upright. Trample is the opposite shape, and how far the other way it goes depends
      // on how hard the blade is being held down.
      //
      // A light push just leans the stem over: concave, so the angle is spent low on the blade
      // and the thing hinges near the ground instead of flopping its top over. Real pressure
      // goes further and changes the silhouette rather than just deepening it - the angle peaks
      // past vertical around mid-blade, laying that stretch flat along the floor and pointing
      // away from whoever is standing there, and then eases back off so the tip lifts again
      // past the edge of the contact. That hook is the shape grass actually takes around
      // something standing in it, and it is what the single peaked profile below draws.
      //
      // Only the tip value matters to a single-segment blade, so the far ring and the mobile
      // LOD tip rigidly either way and see none of this.
      float leanProfile = t * (2.0 - t);
      float pressedProfile = t * (3.36 - 2.81 * t);
      float displacementTip = mix(leanProfile, pressedProfile, smoothstep(0.45, 0.95, displacementAmount));

      vec3 basePosition = vec3(worldXZ.x, worldY, worldXZ.y);
      vec3 relativePosition = vec3(aBladeYaw.x, 0.0, aBladeYaw.y) * side * width;
      relativePosition.y += height * t;
      vec3 bladeNormal = normalize(vec3(-aBladeYaw.y, 0.38, aBladeYaw.x));

      mat3 bend = rotateAroundAxis(normalize(vec3(bendDirection.y, 0.0, -bendDirection.x)), bendAngle * curveT);
      relativePosition = bend * relativePosition;
      bladeNormal = bend * bladeNormal;

      if (displacementAmount > 0.004) {
         // Being shouldered aside and being stood on are different motions, so they are summed
         // as vectors and applied as one rotation. Crush uses the blade's own facing rather
         // than a shared direction: a print where every blade goes down the way it happened to
         // be pointing reads as matted, where one where they all fall the same way reads as a
         // brush stroke.
         vec2 crushDirection = vec2(aBladeYaw.x, aBladeYaw.y);
         vec2 flattenVector = trampleDirection * trampleBend * radians(${glsl.bendAngle}) +
            crushDirection * trampleCrush * radians(${glsl.crushAngle});
         // The nudge keeps the axis defined when bend and crush cancel each other out exactly,
         // which would otherwise normalize a zero vector and put NaNs through the whole matrix.
         vec2 flattenDirection = normalize(flattenVector + vec2(0.0001, -0.0002));
         // Bend and crush can also point the same way, and then their angles add, so the sum
         // has to be capped: a blade taken much past horizontal folds its tip into the ground.
         float flattenAngle = min(length(flattenVector), radians(${glsl.crushAngle}));

         mat3 flatten = rotateAroundAxis(
            normalize(vec3(flattenDirection.y, 0.0, -flattenDirection.x)),
            -flattenAngle * displacementTip
         );

         relativePosition = flatten * relativePosition;
         // What is left standing after a foot has been through it is shorter as well as bent,
         // and that loss of height is most of what separates a footprint from a windblown patch.
         // Being shouldered aside costs a blade some reach too, which is what finally clears the
         // ones rooted under a character - their bases cannot move, so the height has to give.
         relativePosition.y *= mix(1.0, ${glsl.bendSquash}, trampleBend * displacementTip) *
            mix(1.0, ${glsl.crushSquash}, trampleCrush * displacementTip);
         bladeNormal = flatten * bladeNormal;
      }

      vec3 transformed = basePosition + relativePosition;

      // Grass is lit per vertex. A blade is a few pixels wide, so this is indistinguishable
      // from per-pixel lighting while leaving the fragment stage almost free - which is what
      // mobile needs, because the fragment stage is the one running under all the overdraw.
      float ndl = dot(bladeNormal, uSunDirection);
      float wrapDiffuse = ndl * 0.5 + 0.5;
      float backlight = max(0.0, -ndl);
      backlight = backlight * backlight * backlight;
      vec3 halfVector = normalize(uSunDirection + normalize(uCameraPosition - transformed));
      float sheen = max(0.0, dot(halfVector, bladeNormal));
      sheen = sheen * sheen;
      sheen = sheen * sheen;
      sheen = sheen * sheen;

      vec3 color = aBladeColor * mix(vec3(0.34, 0.40, 0.31), vec3(0.80, 0.90, 0.63), t);
      color *= mix(vec3(0.86, 0.92, 0.80), vec3(1.10, 1.06, 0.86), clump);
      color *= mix(0.70, 1.20, wrapDiffuse);
      color += aBladeColor * vec3(0.62, 0.86, 0.34) * backlight * 0.9 * t;
      color += vec3(0.17, 0.19, 0.11) * sheen * t;
      // Flattened grass sits in its own shadow, and a crushed patch more so than a brushed one.
      color *= mix(1.0, 0.6, (trampleBend * 0.65 + trampleCrush) * displacementTip);
      color *= mix(0.55, 1.0, visibility);

      vColor = color;
      // Saturating early keeps the opaque layer's per-blade hash cutout confined to the very
      // end of the fade, where blades have already shrunk to a stub. Letting it reach further
      // in makes full-height blades wink out one by one, which draws a ring on the ground.
      vAlpha = smoothstep(0.02, 0.32, visibility) * uAlphaScale;
      vHash = bladeHash;
      // Deliberately softer than the scene's linear fog. Matching THREE.Fog exactly is more
      // physically consistent with the ground, but it darkens mid-distance grass much faster
      // and the field visibly stops sooner because of it.
      vFog = smoothstep(${glsl.fogNear}, ${glsl.fogFar}, distance(uCameraPosition, transformed));

      gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
   }
`

const fragmentShader = `
   uniform vec3 uFogColor;

   varying vec3 vColor;
   varying float vAlpha;
   varying float vFog;
   varying float vHash;

   void main() {
      #ifdef OPAQUE_GRASS
         // A stable per-blade hash rather than a screen-space dither: blades in the fade band
         // drop out one at a time instead of dissolving, so nothing shimmers as the camera
         // moves, and the layer stays fully opaque and depth-writing.
         if (vAlpha < vHash) {
            discard;
         }

         gl_FragColor = vec4(mix(vColor, uFogColor, vFog), 1.0);
      #else
         if (vAlpha < 0.02) {
            discard;
         }

         gl_FragColor = vec4(mix(vColor, uFogColor, vFog), vAlpha);
      #endif
   }
`

function random(seed: number) {
   const n = Math.sin(seed * 12.9898) * 43758.5453
   return n - Math.floor(n)
}

function createSeededRandom(seed: number) {
   let value = seed >>> 0

   return () => {
      value = (value * 1664525 + 1013904223) >>> 0
      return value / 4294967296
   }
}

/**
 * Bakes everything the blade shader used to recompute per vertex into a single RGBA lookup.
 *   R - terrain height, already max-dilated so blades never sink into a slope
 *   G - clump field, driving patchiness of colour, height and droop
 *   B - lushness field
 *   A - natural lean direction, stored as an angle
 */
function createFieldTexture(size: number) {
   const noise2D = createTerrainNoise()
   const heights = new Float32Array(size * size)
   const dilated = new Float32Array(size * size)
   const worldScale = (WORLD_HALF_SIZE * 2) / (size - 1)
   let minHeight = Infinity
   let maxHeight = -Infinity

   for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
         const worldX = x * worldScale - WORLD_HALF_SIZE
         const worldZ = z * worldScale - WORLD_HALF_SIZE
         const height = getTerrainHeightAtWorld(worldX, worldZ, noise2D)

         heights[z * size + x] = height
         minHeight = Math.min(minHeight, height)
         maxHeight = Math.max(maxHeight, height)
      }
   }

   // Separable max filter: the CPU-side, done-once equivalent of the seven texture taps the
   // shader used to spend per vertex lifting blades clear of the terrain. One texel is exactly
   // the bilinear footprint the GPU interpolates across, which is the smallest radius that
   // keeps blades from poking through the mesh - and being measured in texels it holds at any
   // map size, so the smaller mobile map behaves like the desktop one instead of floating
   // blades higher off the ground.
   const dilationRadius = 1

   for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
         let peak = -Infinity

         for (let offset = -dilationRadius; offset <= dilationRadius; offset++) {
            const sampleX = Math.min(size - 1, Math.max(0, x + offset))
            peak = Math.max(peak, heights[z * size + sampleX])
         }

         dilated[z * size + x] = peak
      }
   }

   for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
         let peak = -Infinity

         for (let offset = -dilationRadius; offset <= dilationRadius; offset++) {
            const sampleZ = Math.min(size - 1, Math.max(0, z + offset))
            peak = Math.max(peak, dilated[sampleZ * size + x])
         }

         heights[z * size + x] = peak
      }
   }

   const heightRange = maxHeight - minHeight || 1
   const pixels = new Uint8Array(size * size * 4)

   for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
         const index = z * size + x
         const worldX = x * worldScale - WORLD_HALF_SIZE
         const worldZ = z * worldScale - WORLD_HALF_SIZE
         const clump = fbm(noise2D, worldX * 0.035, worldZ * 0.035, 2)
         const lush = fbm(noise2D, worldX * 0.09 + 120, worldZ * 0.09 - 80, 2)
         const lean = fbm(noise2D, worldX * 0.013 - 300, worldZ * 0.013 + 240, 1)
         const pixelIndex = index * 4

         pixels[pixelIndex] = Math.round(((heights[index] - minHeight) / heightRange) * 255)
         pixels[pixelIndex + 1] = Math.round(clump * 255)
         pixels[pixelIndex + 2] = Math.round(lush * 255)
         pixels[pixelIndex + 3] = Math.round(lean * 255)
      }
   }

   const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType)
   texture.needsUpdate = true
   texture.minFilter = LinearFilter
   texture.magFilter = LinearFilter
   texture.wrapS = ClampToEdgeWrapping
   texture.wrapT = ClampToEdgeWrapping

   return { texture, minHeight, maxHeight }
}

function tileableValue(x: number, y: number, period: number, seed: number) {
   const wrap = (value: number) => ((value % period) + period) % period
   const ix = Math.floor(x)
   const iy = Math.floor(y)
   let fx = x - ix
   let fy = y - iy

   fx = fx * fx * (3 - 2 * fx)
   fy = fy * fy * (3 - 2 * fy)

   const corner = (cornerX: number, cornerY: number) => random(wrap(cornerX) * 157.31 + wrap(cornerY) * 311.7 + seed)
   const a = corner(ix, iy)
   const b = corner(ix + 1, iy)
   const c = corner(ix, iy + 1)
   const d = corner(ix + 1, iy + 1)

   return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy
}

/**
 * Seamlessly tiling wind field. R carries fine sway, G carries the broad gust fronts that roll
 * across the meadow. Two texture fetches replace the eight sin() calls the old per-blade wind
 * cost every vertex, and coherent weather reads far better than independent blade wobble.
 */
function createWindTexture() {
   const pixels = new Uint8Array(WIND_MAP_SIZE * WIND_MAP_SIZE * 4)

   for (let y = 0; y < WIND_MAP_SIZE; y++) {
      for (let x = 0; x < WIND_MAP_SIZE; x++) {
         const u = x / WIND_MAP_SIZE
         const v = y / WIND_MAP_SIZE
         let sway = 0
         let swayNormalisation = 0
         let amplitude = 1

         for (let octave = 0; octave < 4; octave++) {
            const period = 4 * Math.pow(2, octave)

            sway += tileableValue(u * period, v * period, period, octave * 37) * amplitude
            swayNormalisation += amplitude
            amplitude *= 0.5
         }

         const gust = tileableValue(u * 3, v * 3, 3, 91) * 0.7 + tileableValue(u * 6, v * 6, 6, 17) * 0.3
         const pixelIndex = (y * WIND_MAP_SIZE + x) * 4

         pixels[pixelIndex] = Math.round((sway / swayNormalisation) * 255)
         pixels[pixelIndex + 1] = Math.round(gust * 255)
         pixels[pixelIndex + 2] = 0
         pixels[pixelIndex + 3] = 255
      }
   }

   const texture = new DataTexture(pixels, WIND_MAP_SIZE, WIND_MAP_SIZE, RGBAFormat, UnsignedByteType)
   texture.needsUpdate = true
   texture.minFilter = LinearFilter
   texture.magFilter = LinearFilter
   texture.wrapS = RepeatWrapping
   texture.wrapT = RepeatWrapping

   return texture
}

/**
 * A blade is `segments` stacked quads capped with a tip triangle. One segment is a flat
 * triangle - the mobile and distance LOD - while two or more curve properly once the vertex
 * shader bends each row by a progressively larger angle.
 */
function createBladeShape(segments: number) {
   const shapes: number[] = []
   const indices: number[] = []

   for (let row = 0; row < segments; row++) {
      const t = Math.pow(row / segments, 0.85)

      shapes.push(-1, t, 1, t)
   }

   shapes.push(0, 1)

   for (let row = 0; row < segments - 1; row++) {
      const base = row * 2

      indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3)
   }

   indices.push((segments - 1) * 2, (segments - 1) * 2 + 1, segments * 2)

   return { shapes: new Float32Array(shapes), indices: new Uint16Array(indices), vertexCount: segments * 2 + 1 }
}

function createGrassGeometry(bladeCount: number, patchHalfSize: number, seedOffset: number, segments: number) {
   const blade = createBladeShape(segments)
   const bladeYaws = new Float32Array(bladeCount * 2)
   const bladeColors = new Float32Array(bladeCount * 3)
   const bladeLocalOffsets = new Float32Array(bladeCount * 2)
   const bladeMetrics = new Float32Array(bladeCount * 4)
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

   // Blades are written out in a shuffled order so instance index carries no spatial meaning.
   // Lowering instanceCount then thins the whole field evenly instead of slicing a corner off
   // it, which is what makes the adaptive density dial free at runtime.
   const order = new Uint32Array(bladeCount)

   for (let blade = 0; blade < bladeCount; blade++) {
      order[blade] = blade
   }

   const shuffle = createSeededRandom(seedOffset + 7919)

   for (let blade = bladeCount - 1; blade > 0; blade--) {
      const swap = Math.floor(shuffle() * (blade + 1))
      const held = order[blade]

      order[blade] = order[swap]
      order[swap] = held
   }

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
      const color = greens[Math.floor(random(seed + 60) * greens.length)]
      const colorMix = random(seed + 70)
      const slot = order[blade]
      const vectorOffset = slot * 3
      const offsetOffset = slot * 2
      const metricOffset = slot * 4

      bladeLocalOffsets[offsetOffset] = x
      bladeLocalOffsets[offsetOffset + 1] = z

      bladeYaws[offsetOffset] = Math.sin(yaw)
      bladeYaws[offsetOffset + 1] = -Math.cos(yaw)

      bladeColors[vectorOffset] = color[0] + colorMix * 0.08
      bladeColors[vectorOffset + 1] = color[1] + colorMix * 0.12
      bladeColors[vectorOffset + 2] = color[2]

      bladeMetrics[metricOffset] = 3 + random(seed + 40) * 2
      bladeMetrics[metricOffset + 1] = 0.055 + random(seed + 50) * 0.085
      bladeMetrics[metricOffset + 2] = random(seed + 80) * 60
      bladeMetrics[metricOffset + 3] = random(seed + 110)
   }

   const geometry = new InstancedBufferGeometry()
   geometry.setAttribute('position', new BufferAttribute(new Float32Array(blade.vertexCount * 3), 3))
   geometry.setAttribute('aBladeShape', new BufferAttribute(blade.shapes, 2))
   geometry.setAttribute('aBladeYaw', new InstancedBufferAttribute(bladeYaws, 2))
   geometry.setAttribute('aBladeColor', new InstancedBufferAttribute(bladeColors, 3))
   geometry.setAttribute('aBladeLocalOffset', new InstancedBufferAttribute(bladeLocalOffsets, 2))
   geometry.setAttribute('aBladeMetrics', new InstancedBufferAttribute(bladeMetrics, 4))
   geometry.setIndex(new BufferAttribute(blade.indices, 1))
   geometry.instanceCount = bladeCount
   geometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), WORLD_HALF_SIZE * 2)

   return geometry
}

type FieldMap = ReturnType<typeof createFieldTexture>

/**
 * A mounted layer, as the frame loop sees it.
 *
 * The material matters as much as the geometry here. React Three Fiber rebuilds the `{ value }`
 * wrapper of every uniform when it assigns the `uniforms` prop, keeping the value itself by
 * reference. So mutating a shared Vector or array in place still reaches the GPU, but assigning
 * a shared wrapper's `.value` writes to an object the material no longer holds. Scalars must
 * therefore be written through the material itself.
 */
interface GrassLayerHandle {
   geometry: InstancedBufferGeometry
   material: ShaderMaterial
   bladeCount: number
}

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
   segments: number
   patchSize: number
   fadeStart: number
   fadeEnd: number
   sharedUniforms: Record<string, { value: any }>
   registerLayer: (target: GrassLayerHandle) => () => void
   opaque?: boolean
   minRadius?: number
   alphaScale?: number
   heightScale?: number
   widthScale?: number
   windScale?: number
   interactionScale?: number
   renderOrder?: number
}

const GrassLayer: React.FC<GrassLayerProps> = ({
   bladeCount,
   seedOffset,
   segments,
   patchSize,
   fadeStart,
   fadeEnd,
   sharedUniforms,
   registerLayer,
   opaque = false,
   minRadius = 0,
   alphaScale = 1,
   heightScale = 1,
   widthScale = 1,
   windScale = 1,
   interactionScale = 1,
   renderOrder = 0,
}) => {
   const patchHalfSize = patchSize / 2
   const grass = useMemo(
      () => createGrassGeometry(bladeCount, patchHalfSize, seedOffset, segments),
      [bladeCount, patchHalfSize, seedOffset, segments]
   )

   const materialRef = useRef<ShaderMaterial>(null!)

   useEffect(() => () => grass.dispose(), [grass])
   useEffect(
      () => registerLayer({ geometry: grass, material: materialRef.current, bladeCount }),
      [bladeCount, grass, registerLayer]
   )

   // The shared uniform objects are spread in by reference, so the parent's single useFrame
   // drives time, camera, frustum and the trample map for every layer at once. Only the
   // constants below are unique to this material, and none of them change after mount.
   const uniforms = useMemo(
      () => ({
         ...sharedUniforms,
         uPatchSize: { value: patchSize },
         uPatchHalfSize: { value: patchHalfSize },
         uFadeStart: { value: fadeStart },
         uFadeEnd: { value: fadeEnd },
         uMinRadius: { value: minRadius },
         uAlphaScale: { value: alphaScale },
         uHeightScale: { value: heightScale },
         uWidthScale: { value: widthScale },
         uWindScale: { value: windScale },
         uInteractionScale: { value: interactionScale },
      }),
      [
         alphaScale,
         fadeEnd,
         fadeStart,
         heightScale,
         interactionScale,
         minRadius,
         patchHalfSize,
         patchSize,
         sharedUniforms,
         widthScale,
         windScale,
      ]
   )

   const defines = useMemo(() => (opaque ? { OPAQUE_GRASS: '' } : {}), [opaque])

   return (
      <mesh frustumCulled={false} renderOrder={renderOrder}>
         <primitive object={grass} attach="geometry" />
         <shaderMaterial
            ref={materialRef}
            uniforms={uniforms}
            defines={defines}
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            side={DoubleSide}
            transparent={!opaque}
            depthWrite={opaque}
         />
      </mesh>
   )
}

const Grass: React.FC = () => {
   const [quality] = useState(detectQualityProfile)
   const totalLayers = quality.nearChunks + quality.farChunks
   const [visibleLayerCount, setVisibleLayerCount] = useState(0)
   const shouldCreateGrass = visibleLayerCount > 0

   const fieldMap = useMemo<FieldMap | null>(
      () => (shouldCreateGrass ? createFieldTexture(quality.fieldMapSize) : null),
      [quality.fieldMapSize, shouldCreateGrass]
   )
   const windMap = useMemo(() => (shouldCreateGrass ? createWindTexture() : null), [shouldCreateGrass])

   const trampleField = useMemo(
      () => (shouldCreateGrass ? createTrampleField(quality.trampleMapSize) : null),
      [quality.trampleMapSize, shouldCreateGrass]
   )

   const frustumPlanes = useMemo(() => Array.from({ length: 6 }, () => new Vector4()), [])
   const frustum = useMemo(() => new Frustum(), [])
   const frustumMatrix = useMemo(() => new Matrix4(), [])
   const playerPosition = useMemo(() => new Vector2(0, 0), [])
   const cameraPosition = useMemo(() => new Vector3(0, 0, 0), [])

   const layerHandles = useRef(new Set<GrassLayerHandle>())
   const densityScale = useRef(1)
   const smoothedFrameTime = useRef(1 / 60)
   const framesSinceAdjust = useRef(0)
   const settledFrames = useRef(0)

   // Layers stream in over several seconds, so one arriving late has to be caught up to
   // whatever the adaptive density has already settled on.
   const registerLayer = useCallback((layer: GrassLayerHandle) => {
      layer.geometry.instanceCount = Math.round(layer.bladeCount * densityScale.current)
      layer.material.uniforms.uDensityScale.value = densityScale.current
      layerHandles.current.add(layer)

      return () => {
         layerHandles.current.delete(layer)
      }
   }, [])

   // Vector, array and texture uniforms are shared by reference and mutated in place, so one
   // write here reaches every layer. Scalars are the exception - see GrassLayerHandle.
   const sharedUniforms = useMemo(() => {
      if (!fieldMap || !windMap || !trampleField) {
         return null
      }

      return {
         uTime: { value: 0 },
         uPlayerPosition: { value: playerPosition },
         uFieldMap: { value: fieldMap.texture },
         uWindMap: { value: windMap },
         uTerrainMinHeight: { value: fieldMap.minHeight },
         uTerrainMaxHeight: { value: fieldMap.maxHeight },
         uTerrainMidHeight: { value: (fieldMap.minHeight + fieldMap.maxHeight) / 2 },
         uCameraPosition: { value: cameraPosition },
         uSunDirection: { value: SUN_DIRECTION },
         uFrustumPlanes: { value: frustumPlanes },
         uWindDirection: { value: new Vector2(0.72, 0.42).normalize() },
         uFogColor: { value: new Vector3(0.016, 0.039, 0.086) },
         // Half the terrain relief plus the tallest a blade can stand and sway, so the cull
         // sphere never rejects a blade that should still be on screen.
         uCullRadius: { value: (fieldMap.maxHeight - fieldMap.minHeight) / 2 + 12 },
         uDensityScale: { value: densityScale.current },
         // The trample map ping-pongs between two targets, so unlike every other texture here
         // its value changes every frame and has to be rewritten per material in the loop.
         uTrampleMap: { value: trampleField.texture() },
         uTrampleWindow: { value: trampleField.window },
      }
   }, [cameraPosition, fieldMap, frustumPlanes, playerPosition, trampleField, windMap])

   useEffect(() => {
      const cleanups = Array.from({ length: totalLayers }, (_, index) =>
         scheduleGrassLayer(() => setVisibleLayerCount((count) => Math.max(count, index + 1)), 140 + index * 180)
      )

      return () => {
         cleanups.forEach((cleanup) => cleanup())
      }
   }, [totalLayers])

   useEffect(
      () => () => {
         fieldMap?.texture.dispose()
         windMap?.dispose()
         trampleField?.dispose()
      },
      [fieldMap, trampleField, windMap]
   )

   useFrame((state, delta) => {
      if (!sharedUniforms || !trampleField) {
         return
      }

      const controlsTarget = state.controls?.target
      const localX = controlsTarget?.x ?? state.camera.position.x
      const localZ = controlsTarget?.z ?? state.camera.position.z

      const elapsed = state.clock.elapsedTime
      playerPosition.set(localX, localZ)
      cameraPosition.copy(state.camera.position)

      frustumMatrix.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse)
      frustum.setFromProjectionMatrix(frustumMatrix)

      for (let plane = 0; plane < 6; plane++) {
         const { normal, constant } = frustum.planes[plane]

         frustumPlanes[plane].set(normal.x, normal.y, normal.z, constant)
      }

      // One decay pass and one instanced stamp, for everyone in the meadow at once. This runs
      // before the scene render for the frame, so the map the blades read below is current.
      const trampleMap = trampleField.update(
         state.gl,
         delta,
         localX,
         localZ,
         usePlayerPositionsStore.getState().playerPositions
      )

      // Vector and array uniforms above are mutated in place, so every material sees them
      // through the shared value object. Scalars and the ping-ponged trample texture cannot
      // work that way (see GrassLayerHandle), so they are written to each material directly.
      layerHandles.current.forEach((layer) => {
         layer.material.uniforms.uTime.value = elapsed
         layer.material.uniforms.uTrampleMap.value = trampleMap
      })

      if (visibleLayerCount < totalLayers) {
         settledFrames.current = 0
         return
      }

      // Adaptive density. The blade order is shuffled, so trimming instanceCount thins the
      // field evenly and costs nothing to apply. A slow EMA and a cooldown stop it hunting.
      smoothedFrameTime.current += (Math.min(delta, 0.1) - smoothedFrameTime.current) * 0.04
      settledFrames.current++
      framesSinceAdjust.current++

      if (settledFrames.current < 120 || framesSinceAdjust.current < 30) {
         return
      }

      const previousDensity = densityScale.current

      if (smoothedFrameTime.current > quality.targetFrameTime * 1.18) {
         densityScale.current = Math.max(quality.minDensity, previousDensity - 0.08)
      } else if (smoothedFrameTime.current < quality.targetFrameTime * 0.92) {
         densityScale.current = Math.min(1, previousDensity + 0.04)
      }

      framesSinceAdjust.current = 0

      if (densityScale.current !== previousDensity) {
         layerHandles.current.forEach((layer) => {
            layer.geometry.instanceCount = Math.round(layer.bladeCount * densityScale.current)
            layer.material.uniforms.uDensityScale.value = densityScale.current
         })
      }
   })

   if (!sharedUniforms) {
      return null
   }

   const nearBladesPerChunk = Math.round(quality.nearBlades / quality.nearChunks)
   const farBladesPerChunk = Math.round(quality.farBlades / quality.farChunks)

   return (
      <>
         {Array.from({ length: quality.farChunks }, (_, chunkIndex) =>
            visibleLayerCount >= quality.nearChunks + chunkIndex + 1 ? (
               <GrassLayer
                  key={`far-${chunkIndex}`}
                  bladeCount={farBladesPerChunk}
                  seedOffset={4000000 + chunkIndex * farBladesPerChunk}
                  segments={1}
                  patchSize={FAR_PATCH_SIZE}
                  fadeStart={FAR_FADE_START}
                  fadeEnd={FAR_FADE_END}
                  minRadius={FAR_INNER_RADIUS}
                  alphaScale={0.7}
                  heightScale={0.92 * quality.bladeHeightScale}
                  widthScale={0.95 * quality.bladeWidthScale}
                  windScale={0.85}
                  interactionScale={0}
                  sharedUniforms={sharedUniforms}
                  registerLayer={registerLayer}
                  renderOrder={1}
               />
            ) : null
         )}
         {Array.from({ length: quality.nearChunks }, (_, chunkIndex) =>
            visibleLayerCount >= chunkIndex + 1 ? (
               <GrassLayer
                  key={`near-${chunkIndex}`}
                  bladeCount={nearBladesPerChunk}
                  seedOffset={chunkIndex * nearBladesPerChunk}
                  segments={quality.bladeSegments}
                  patchSize={NEAR_PATCH_SIZE}
                  fadeStart={NEAR_FADE_START}
                  fadeEnd={NEAR_FADE_END}
                  heightScale={quality.bladeHeightScale}
                  widthScale={quality.bladeWidthScale}
                  interactionScale={1}
                  opaque
                  sharedUniforms={sharedUniforms}
                  registerLayer={registerLayer}
                  renderOrder={0}
               />
            ) : null
         )}
      </>
   )
}

export default Grass
