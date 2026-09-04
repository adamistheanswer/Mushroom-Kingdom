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
   UniformsLib,
   UniformsUtils,
   Vector2,
   Vector3,
   Vector4,
} from 'three'
import { MOONLIGHT_OFFSET, WORLD_HALF_SIZE } from '../constants'
import { isHandheldDevice } from '../Utils/isHandheldDevice'
import { FOG_FAR, FOG_NEAR, SCENE_FOG_COLOR } from './sceneQuality'
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


const GUST_LEAD_TEXELS = 10

/**
 * Wind is three things happening at once on three different timescales, and the reason a
 * meadow reads as a meadow is that they are independent of one another.
 *
 * The breeze never stops. It is broad and slow, neighbouring blades share it, and it is what
 * keeps the field alive in the gaps between everything else.
 *
 * Gusts are events. A front arrives, sweeps through, and leaves, and then nothing happens for
 * a while. The important word is "a while" - if gusts arrive on a schedule the field turns into
 * a flag, and no amount of noise warping a carrier wave's phase will hide the beat underneath
 * it. So there is no carrier here at all: the gust field is plain noise advected downwind and
 * then thresholded, which gives fronts of uneven width, at uneven spacing, at uneven strength,
 * because that is simply what noise looks like when you cut it at a level.
 *
 * Flutter belongs to the blade rather than to the meadow. It is the only oscillator in here,
 * and its phase and rate are both hashed per blade, because a shared one reads instantly as the
 * whole field pulsing on a beat.
 */
export interface GrassWindSettings {
   directionDegrees: number
   directionVariance: number
   bendDegrees: number
   breezeStrength: number
   breezeScale: number
   breezeSpeed: number
   breezeVariation: number
   flutterStrength: number
   flutterSpeed: number
   gustStrength: number
   gustScale: number
   gustSpeed: number
   gustFrequency: number
   gustSharpness: number
   gustCrest: number
   gustRebound: number
   gustLobing: number
   responseMin: number
   responseMax: number
   clumpResponse: number
}

// Both scales are one over a world distance, so the numbers look small and the sizes they mean
// are not: 1/scale is the distance the field repeats over, and the features inside it run from
// that down to about a third of it. Read them against the 300 unit fog distance to know whether
// one front crosses the whole view or a dozen ripple across it at once.
//
// Tuned on screen rather than derived, so read the shape rather than the individual numbers.
// Four of these are worth understanding before touching anything, because they are not where
// the defaults started and they are what gives the field its character.
//
// The breeze is off. There is no steady background lean at all, so between fronts the meadow is
// almost still - a few tenths of a degree of flutter - and every bit of visible motion is a
// gust. That is why gustFrequency is at the top of its range: with nothing underneath them, the
// fronts have to be more or less continuous or the field reads as dead.
//
// gustScale is at the top of its range too, which makes the fronts small - cells of roughly 40
// to 125 world units against a 300 unit view, so several ripple across the screen at once
// rather than one wave sweeping through. Note this shortens the crest's lead as a side effect;
// see GUST_LEAD_TEXELS.
//
// responseMax is below responseMin, which is not a mistake but does invert the reading: the
// blades with a high hash are the stiff ones here, not the loose ones. Together with the low
// clumpResponse it holds the whole field's response between 0.14 and 0.4, and the bend budget
// is spent by the gust and crest terms rather than by the blades being willing.
export const DEFAULT_GRASS_WIND_SETTINGS: GrassWindSettings = {
   directionDegrees: 30,
   directionVariance: 0.9,
   bendDegrees: 13.5,
   breezeStrength: 0,
   breezeScale: 0.001,
   breezeSpeed: 0,
   breezeVariation: 0,
   flutterStrength: 0.19,
   flutterSpeed: 6.45,
   gustStrength: 1.6,
   gustScale: 0.008,
   gustSpeed: 14.5,
   gustFrequency: 1,
   gustSharpness: 0.13,
   gustCrest: 1.24,
   gustRebound: 0.93,
   gustLobing: 0.27,
   responseMin: 0.4,
   responseMax: 0.22,
   clumpResponse: 0.63,
}

/**
 * The two presets are one dial on the tuned default rather than settings in their own right.
 *
 * They used to be written as absolute overrides, and they inverted quietly every time the
 * default was retuned - a "calm" that bent further than the default, a "blustery" with weaker
 * gusts than it. Twice. Scaling instead means they cannot come out of order however far the
 * default moves, and they keep its art direction - front size, swirl, stiffness curve, whether
 * there is a breeze at all - rather than overwriting it with numbers from an older look.
 *
 * Amplitudes take the dial directly. Rates and speeds take a softened version of it, because a
 * calmer day is mostly a smaller wind rather than a slower one, and dropping the speeds as hard
 * as the strengths reads as slow motion instead of calm.
 */
function scaleGrassWindEnergy(settings: GrassWindSettings, energy: number): GrassWindSettings {
   const eased = Math.pow(energy, 0.6)

   return {
      ...settings,
      bendDegrees: settings.bendDegrees * energy,
      breezeStrength: settings.breezeStrength * energy,
      breezeSpeed: settings.breezeSpeed * eased,
      flutterStrength: settings.flutterStrength * eased,
      flutterSpeed: settings.flutterSpeed * eased,
      gustStrength: settings.gustStrength * energy,
      gustSpeed: settings.gustSpeed * eased,
      // The only one that has a hard ceiling: past 1 the gate stops moving and the dial would
      // silently do nothing.
      gustFrequency: Math.min(1, settings.gustFrequency * eased),
      gustCrest: settings.gustCrest * eased,
      gustRebound: settings.gustRebound * eased,
   }
}

// Barely moving air. Useful as a baseline when tuning: whatever is still moving at this setting
// is flutter and breeze, and any beat you can see in it is a bug.
export const CALM_GRASS_WIND_SETTINGS = scaleGrassWindEnergy(DEFAULT_GRASS_WIND_SETTINGS, 0.45)

// Weather. Fronts arrive often enough to overlap, and hard enough to lay the field over.
export const BLUSTERY_GRASS_WIND_SETTINGS = scaleGrassWindEnergy(DEFAULT_GRASS_WIND_SETTINGS, 1.7)

type GrassWindUniforms = Record<string, { value: number | Vector2 | Vector3 }>

// Declared once and shared by both the blade shader and the debug visualiser, so the two cannot
// drift apart. uTime and uWindMap live here too - anything that samples wind needs them.
export const GRASS_WIND_UNIFORMS_GLSL = `
   uniform float uTime;
   uniform sampler2D uWindMap;
   uniform vec2 uWindDirection;
   // Where the weather has got to, written once a frame by updateGrassWindFlow. These depend on
   // nothing but the clock, so leaving them in the shader means evaluating five identical sines
   // at every vertex of every blade in the meadow.
   //   x - how far the wind has veered across the field, in world units
   //   y - how far ahead of its steady travel the gust field is running, in world units
   //   z - the slow drift of the gust gate, which is the wind getting up and dying back down
   uniform vec3 uWindFlow;
   uniform float uWindDirectionVariance;
   uniform float uWindBendDegrees;
   uniform float uBreezeStrength;
   uniform float uBreezeScale;
   uniform float uBreezeSpeed;
   uniform float uBreezeVariation;
   uniform float uFlutterStrength;
   uniform float uFlutterSpeed;
   uniform float uGustStrength;
   uniform float uGustScale;
   uniform float uGustSpeed;
   uniform float uGustFrequency;
   uniform float uGustSharpness;
   uniform float uGustCrest;
   uniform float uGustRebound;
   uniform float uGustLobing;
   uniform float uWindResponseMin;
   uniform float uWindResponseMax;
   uniform float uWindClumpResponse;
`

export const GRASS_WIND_SAMPLE_GLSL = `
   struct GrassWindSample {
      // Total bend factor. Goes slightly negative where a blade springs back past upright.
      float sway;
      float directionNoise;
      float breeze;
      // The gust envelope, 0 between fronts and 1 inside one.
      float gust;
      // The leading edge only - non-zero for the moment the wind is picking up here.
      float crest;
      // How much of the bend is a front hitting rather than a steady lean, which decides both
      // the shape the blade takes and how much of its pale underside shows.
      float whip;
   };

   GrassWindSample sampleGrassWind(vec2 worldXZ, float bladeHash, float bladeOffset, float clump) {
      vec2 perp = vec2(-uWindDirection.y, uWindDirection.x);
      // Two dot products buy the whole model its shape: with U running downwind, advecting the
      // gust field is a slide along U, and the pre-shifted alpha channel lines up with it.
      float along = dot(worldXZ, uWindDirection);
      float across = dot(worldXZ, perp);

      // A blade standing still, sampling a field that slides past it at a fixed speed in a
      // fixed direction, traces one straight line through the noise forever. It therefore has
      // its own private climate, and that climate repeats every time the field has moved on by
      // a tile. Making the field itself lumpier does not help: the line is still a line.
      //
      // So the line is bent instead. The wind veers slowly across the meadow, and its speed
      // surges, and between them the blade traces a wandering curve that never comes back to
      // itself. Over an hour this is what takes the spread of intervals between gusts at one
      // spot from plus or minus five per cent of the mean to plus or minus eighty, which is
      // roughly what real gust arrivals look like.
      vec4 gustTap = texture2D(
         uWindMap,
         vec2(along - uTime * uGustSpeed - uWindFlow.y, across + uWindFlow.x) * uGustScale
      );
      float field = gustTap.b;
      float ahead = gustTap.a;
      float ragged = gustTap.g;

      // A gust is an event, not a level. Most of the field sits below the gate and stays quiet;
      // a front is the part of the noise that happens to clear it. Raising uGustFrequency drops
      // the gate, so fronts get wider and closer together rather than merely stronger.
      //
      // The gate wanders too, on periods of five and twelve minutes. That is the difference
      // between a meadow and a wind tunnel: the wind gets up for a while and then dies back,
      // and neither the player nor the pattern can anticipate when.
      float gate = mix(0.86, 0.30, uGustFrequency) + (ragged - 0.5) * uGustLobing + uWindFlow.z;
      float band = mix(0.32, 0.05, uGustSharpness);
      float body = smoothstep(gate, gate + band, field);

      // How hard the wind is rising at this blade, from the pre-shifted channel. The two signs
      // are not the same motion and must not be treated as one: grass goes over fast and comes
      // back slowly, so the leading edge gets a snap that overshoots the steady bend, and the
      // trailing edge lets the blade spring back through upright before it settles.
      //
      // Which is why the two are gated differently. Gating both by the envelope here would put
      // the snap where the envelope has barely started and the spring-back where it is still at
      // full strength - the asymmetry backwards, and measurably so. The snap belongs to the
      // gust that is arriving, so it is gated by the envelope of the field ahead, and it leads
      // the bend rather than trailing it. That is the wave you can see coming across a meadow
      // before it reaches you.
      float rise = (ahead - field) * 4.0;
      float crest = max(rise, 0.0) * smoothstep(gate, gate + band, ahead);
      float rebound = max(-rise, 0.0) * body;
      float gust = body * uGustStrength + crest * uGustCrest - rebound * uGustRebound;

      vec4 breezeTap = texture2D(uWindMap, vec2(along - uTime * uBreezeSpeed, across) * uBreezeScale);
      float breezeField = breezeTap.r;
      float breeze = uBreezeStrength * mix(1.0 - uBreezeVariation, 1.0 + uBreezeVariation, breezeField);

      // Hashing the phase is not enough on its own - blades started at different phases of the
      // same frequency still visibly share it. Detuning the rate as well is what turns the
      // field into a shimmer instead of a wave.
      float detune = fract(bladeHash * 7.31 + bladeOffset * 0.017);
      float flutterPhase = bladeHash * 6.2831853 + bladeOffset;
      float flutterRate = uFlutterSpeed * mix(0.68, 1.42, detune);
      float flutter = sin(uTime * flutterRate + flutterPhase);
      // A slower second beat against the first, so a blade the camera is close enough to follow
      // does not read as a metronome on its own either.
      flutter *= 0.62 + 0.38 * sin(uTime * flutterRate * 0.37 + flutterPhase * 1.7);
      // Still air does not make grass quiver. The quiver is wind arriving in eddies too small
      // to bend the blade, so it has to scale with how much wind there is to eddy.
      float flutterAmount = uFlutterStrength * flutter *
         (0.55 + 0.75 * clamp(breeze + max(gust, 0.0), 0.0, 1.2)) *
         mix(0.7, 1.3, breezeTap.g);

      float response = mix(uWindResponseMin, uWindResponseMax, bladeHash) *
         mix(1.0, uWindClumpResponse, clump);

      GrassWindSample wind;
      wind.sway = clamp((breeze + gust + flutterAmount) * response, -0.2, 1.5);
      // Wind veers as it gusts, and a blade caught on the shoulder of a front turns further off
      // axis than one in the middle of it.
      wind.directionNoise = (ragged - 0.5) * (0.6 + body * 1.4) +
         (breezeField - 0.5) * 0.7 +
         flutter * 0.3;
      wind.breeze = breeze;
      wind.gust = body;
      wind.crest = crest;
      wind.whip = clamp(crest * 1.9 + body * 0.35, 0.0, 1.0);

      return wind;
   }
`

function windDirectionVector(settings: GrassWindSettings, target = new Vector2()) {
   const radians = (settings.directionDegrees * Math.PI) / 180

   return target.set(Math.cos(radians), Math.sin(radians))
}

export function createGrassWindUniforms(settings: GrassWindSettings): GrassWindUniforms {
   return {
      uWindDirection: { value: windDirectionVector(settings) },
      uWindFlow: { value: new Vector3() },
      uWindDirectionVariance: { value: settings.directionVariance },
      uWindBendDegrees: { value: settings.bendDegrees },
      uBreezeStrength: { value: settings.breezeStrength },
      uBreezeScale: { value: settings.breezeScale },
      uBreezeSpeed: { value: settings.breezeSpeed },
      uBreezeVariation: { value: settings.breezeVariation },
      uFlutterStrength: { value: settings.flutterStrength },
      uFlutterSpeed: { value: settings.flutterSpeed },
      uGustStrength: { value: settings.gustStrength },
      uGustScale: { value: settings.gustScale },
      uGustSpeed: { value: settings.gustSpeed },
      uGustFrequency: { value: settings.gustFrequency },
      uGustSharpness: { value: settings.gustSharpness },
      uGustCrest: { value: settings.gustCrest },
      uGustRebound: { value: settings.gustRebound },
      uGustLobing: { value: settings.gustLobing },
      uWindResponseMin: { value: settings.responseMin },
      uWindResponseMax: { value: settings.responseMax },
      uWindClumpResponse: { value: settings.clumpResponse },
   }
}

/**
 * Advances the parts of the wind that are the same everywhere, once per frame.
 *
 * All three are slow, and none of them is the wind itself - they are what stops the wind from
 * repeating. A field sliding past at a fixed speed in a fixed direction hands every blade the
 * same sequence of gusts over and over; veering it, surging it, and drifting the level at which
 * a gust counts as a gust are what turn that sequence into weather.
 */
export function updateGrassWindFlow(
   uniforms: Record<string, { value: any }>,
   elapsed: number,
   settings: GrassWindSettings
) {
   uniforms.uWindFlow.value.set(
      Math.sin(elapsed * 0.037) * 130 + Math.sin(elapsed * 0.0161 + 2.1) * 85 + Math.sin(elapsed * 0.0071 + 0.6) * 55,
      // A fraction of the wind speed rather than a fixed distance, so the surge stays in
      // proportion and fronts can never be driven backwards when the speed is turned down.
      settings.gustSpeed * (Math.sin(elapsed * 0.029) * 7.8 + Math.sin(elapsed * 0.0117 + 0.7) * 5),
      Math.sin(elapsed * 0.021) * 0.06 + Math.sin(elapsed * 0.0083 + 1.3) * 0.04
   )
}

export function applyGrassWindSettings(uniforms: Record<string, { value: any }>, settings: GrassWindSettings) {
   // Mutated in place rather than reassigned, because every grass layer holds this same vector
   // by reference and only sees writes that go through it.
   windDirectionVector(settings, uniforms.uWindDirection.value)
   uniforms.uWindDirectionVariance.value = settings.directionVariance
   uniforms.uWindBendDegrees.value = settings.bendDegrees
   uniforms.uBreezeStrength.value = settings.breezeStrength
   uniforms.uBreezeScale.value = settings.breezeScale
   uniforms.uBreezeSpeed.value = settings.breezeSpeed
   uniforms.uBreezeVariation.value = settings.breezeVariation
   uniforms.uFlutterStrength.value = settings.flutterStrength
   uniforms.uFlutterSpeed.value = settings.flutterSpeed
   uniforms.uGustStrength.value = settings.gustStrength
   uniforms.uGustScale.value = settings.gustScale
   uniforms.uGustSpeed.value = settings.gustSpeed
   uniforms.uGustFrequency.value = settings.gustFrequency
   uniforms.uGustSharpness.value = settings.gustSharpness
   uniforms.uGustCrest.value = settings.gustCrest
   uniforms.uGustRebound.value = settings.gustRebound
   uniforms.uGustLobing.value = settings.gustLobing
   uniforms.uWindResponseMin.value = settings.responseMin
   uniforms.uWindResponseMax.value = settings.responseMax
   uniforms.uWindClumpResponse.value = settings.clumpResponse
}

// Matches the directional light in Environment/Lighting.
const SUN_DIRECTION = new Vector3(...MOONLIGHT_OFFSET).normalize()
const GRASS_FOG_COLOR = hexColorToShaderVector(SCENE_FOG_COLOR)

function hexColorToShaderVector(hexColor: string) {
   const hex = hexColor.replace('#', '')
   const value = Number.parseInt(hex, 16)

   return new Vector3(
      ((value >> 16) & 255) / 255,
      ((value >> 8) & 255) / 255,
      (value & 255) / 255
   )
}

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

// Mobile runs the same two-segment blade as desktop, just fewer of them. Segment count is the
// one dial here that changes what the grass *is* rather than how much of it there is: a single
// segment blade is a rigid triangle that cannot curve under wind, and it collapses the whole
// peaked trample profile into a flat tip-over, so a handheld field of them reads as a different
// asset from the desktop one no matter how densely it is packed. Two segments costs five
// vertices per blade instead of three, and that is the right place to spend the budget.
//
// The rest of the profile pays for it. Blade count stays below desktop's, and the width margin
// left over covers the shortfall - width is free per vertex, where every extra blade is another
// instance to transform. The adaptive density loop below is the real safety net: a device that
// cannot hold the frame budget thins the field rather than dropping back to flat blades, and
// minDensity keeps its worst case above what the old, wider profile drew at full strength.
const MOBILE_QUALITY: QualityProfile = {
   nearBlades: 400000,
   nearChunks: 7,
   farBlades: 140000,
   farChunks: 3,
   bladeSegments: 2,
   bladeWidthScale: 1.1,
   bladeHeightScale: 1,
   fieldMapSize: 640,
   trampleMapSize: 512,
   minDensity: 0.45,
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

   ${GRASS_WIND_UNIFORMS_GLSL}

   uniform vec2 uPlayerPosition;
   uniform sampler2D uFieldMap;
   uniform float uTerrainMinHeight;
   uniform float uTerrainMaxHeight;
   uniform float uTerrainMidHeight;
   uniform vec3 uCameraPosition;
   uniform vec3 uSunDirection;
   uniform vec4 uFrustumPlanes[6];
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

   #include <common>
   #include <shadowmap_pars_vertex>

   ${GRASS_WIND_SAMPLE_GLSL}

   mat3 rotateAroundAxis(vec3 axis, float angle) {
      float s = sin(angle);
      float c = cos(angle);
      float oc = 1.0 - c;

      return mat3(
         oc * axis.x * axis.x + c,
         oc * axis.x * axis.y + axis.z * s,
         oc * axis.z * axis.x - axis.y * s,
         oc * axis.x * axis.y - axis.z * s,
         oc * axis.y * axis.y + c,
         oc * axis.y * axis.z + axis.x * s,
         oc * axis.z * axis.x + axis.y * s,
         oc * axis.y * axis.z - axis.x * s,
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

      // A constant breeze, a per-blade flutter, and gust fronts that sweep through on no
      // schedule at all. Two texture fetches, and no state that has to survive between frames.
      GrassWindSample wind = sampleGrassWind(worldXZ, bladeHash, aBladeMetrics.z, clump);

      vec2 windPerp = vec2(-uWindDirection.y, uWindDirection.x);
      float terrainLeanBias = field.a * 2.0 - 1.0;
      vec2 leanDirection = normalize(
         uWindDirection * 0.86 +
            windPerp * terrainLeanBias * 0.18 +
            vec2(aBladeYaw.x, aBladeYaw.y) * (bladeHash - 0.5) * 0.08
      );
      float leanStrength = radians(mix(1.2, 5.6, clump)) *
         mix(1.0, 0.48, smoothstep(0.1, 0.58, wind.sway));
      // A blade that is already pressed flat has nothing left for the wind to move, which is
      // what stops a fresh trail from shimmering in the breeze like the field around it.
      float windStrength = radians(uWindBendDegrees) * wind.sway * uWindScale *
         (1.0 - 0.8 * max(trampleCrush, trampleBend * 0.6));
      vec2 windDirection = normalize(uWindDirection + windPerp * wind.directionNoise * uWindDirectionVariance);

      // Natural droop and wind used to be two separate axis rotations. Folding them into one
      // removes a whole matrix build per vertex, but it has to be done as a vector sum. The
      // magnitude of the combined vector is the angle, and its normal is the direction.
      vec2 bendVector = windDirection * windStrength + leanDirection * leanStrength;
      float bendAngle = length(bendVector);
      vec2 bendDirection = bendVector / max(bendAngle, 0.0001);

      // Rotating each vertex by an angle that grows along the blade bends it into an arc
      // rather than tipping it rigidly, which is what gives multi-segment blades a real
      // curved silhouette. A single-segment blade collapses to the old rigid behaviour.
      // A steady lean bows a blade along its whole length. A front hitting it does something
      // else: the stem holds and the top half is thrown over. Driving the bend profile with the
      // gust's leading edge is what makes a wave crossing the meadow read as a different motion
      // rather than as more of the same one.
      float curveT = mix(t * (0.45 + 0.55 * t), t * t * (0.25 + 0.75 * t), wind.whip);
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
      // Only the tip value matters to a single-segment blade, so the far ring tips rigidly
      // either way and sees none of this.
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

         // The angle used to be negated here, which cancelled the transposed matrix above and
         // is why trample was the one thing leaning the right way while the wind was not.
         mat3 flatten = rotateAroundAxis(
            normalize(vec3(flattenDirection.y, 0.0, -flattenDirection.x)),
            flattenAngle * displacementTip
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
      // Half of what a gust looks like from any distance is a change of colour rather than of
      // shape: blades thrown past the horizontal turn their pale undersides up, and the front
      // reads as a light band running across the field. The normal-based sheen above catches
      // some of this on its own; this is the rest of it.
      color = mix(color, color * vec3(1.16, 1.2, 1.1) + vec3(0.028, 0.032, 0.024), wind.whip * t * 0.5);
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

      vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
      #include <shadowmap_vertex>

      gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
   }
`

const fragmentShader = `
   uniform vec3 uFogColor;
   uniform bool receiveShadow;

   varying vec3 vColor;
   varying float vAlpha;
   varying float vFog;
   varying float vHash;

   #include <common>
   #include <shadowmap_pars_fragment>
   #include <shadowmask_pars_fragment>

   void main() {
      float shadowMask = getShadowMask();
      vec3 shadowedColor = vColor * mix(0.68, 1.0, shadowMask);

      #ifdef OPAQUE_GRASS
         // A stable per-blade hash rather than a screen-space dither: blades in the fade band
         // drop out one at a time instead of dissolving, so nothing shimmers as the camera
         // moves, and the layer stays fully opaque and depth-writing.
         if (vAlpha < vHash) {
            discard;
         }

         gl_FragColor = vec4(mix(shadowedColor, uFogColor, vFog), 1.0);
      #else
         if (vAlpha < 0.02) {
            discard;
         }

         gl_FragColor = vec4(mix(shadowedColor, uFogColor, vFog), vAlpha);
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
 * Flattens a channel's histogram, in place of using it as it falls out of the noise.
 *
 * Value noise is clustered hard around its mean - interpolating random corners throws most of
 * the range away, and summing octaves narrows it further - so a threshold applied to it raw
 * lands somewhere unpredictable on a very steep part of the distribution. Cutting the gust
 * field at 0.64 sounds like it should leave a third of the meadow gusting; against the raw
 * field it left none of it.
 *
 * The remap is monotonic, so every level set keeps its shape and the field stays as smooth as
 * it was - a front is still the same outline, it is just now reachable. What it buys is that
 * the gate means exactly what it says whatever the octave weights are: a gate of 0.7 puts
 * thirty percent of the field inside a gust. It also stretches the tails, and that is where the
 * hard edge of a front comes from.
 */
// A counting sort over quantised buckets rather than a real one. The result is written to eight
// bits, so resolving the distribution finer than this cannot change a texel, and this is linear
// where sorting sixty-five thousand indices per channel is seventy-five milliseconds of startup.
const HISTOGRAM_BUCKETS = 4096

function flattenHistogram(values: Float32Array) {
   let min = Infinity
   let max = -Infinity

   for (let index = 0; index < values.length; index++) {
      min = Math.min(min, values[index])
      max = Math.max(max, values[index])
   }

   const scale = max > min ? (HISTOGRAM_BUCKETS - 1) / (max - min) : 0
   const buckets = new Uint16Array(values.length)
   const ranks = new Float32Array(HISTOGRAM_BUCKETS)

   for (let index = 0; index < values.length; index++) {
      const bucket = Math.round((values[index] - min) * scale)

      buckets[index] = bucket
      ranks[bucket]++
   }

   // Every value in a bucket maps to that bucket's mid rank, so the remap stays centred rather
   // than pinning one end of the range to the count below it.
   let below = 0

   for (let bucket = 0; bucket < HISTOGRAM_BUCKETS; bucket++) {
      const held = ranks[bucket]

      ranks[bucket] = (below + held * 0.5) / values.length
      below += held
   }

   const flattened = new Float32Array(values.length)

   for (let index = 0; index < values.length; index++) {
      flattened[index] = ranks[buckets[index]]
   }

   return flattened
}

/**
 * Seamlessly tiling wind field, four channels that are read at two very different scales.
 *
 *   R - broad fbm. Read at breeze scale, where it is the breeze itself.
 *   G - mid detail. Read at gust scale it breaks the fronts up into lobes so they do not cross
 *       the meadow as straight lines; read at breeze scale it varies flutter across the field.
 *   B - the gust field. Deliberately only two octaves: the shader makes fronts out of this by
 *       cutting it at a level, and every extra octave punches holes in them.
 *   A - B again, shifted GUST_LEAD_TEXELS upwind. Because wind is sampled in wind space, that
 *       is "the gust field as it will be here shortly" for any wind direction, and it comes
 *       back in the fetch that was already being made.
 */
export function createWindTexture() {
   const texelCount = WIND_MAP_SIZE * WIND_MAP_SIZE
   const pixels = new Uint8Array(texelCount * 4)
   const rawBreeze = new Float32Array(texelCount)
   const rawDetail = new Float32Array(texelCount)
   const rawGust = new Float32Array(texelCount)

   for (let y = 0; y < WIND_MAP_SIZE; y++) {
      for (let x = 0; x < WIND_MAP_SIZE; x++) {
         const u = x / WIND_MAP_SIZE
         const v = y / WIND_MAP_SIZE
         const index = y * WIND_MAP_SIZE + x
         let breeze = 0
         let amplitude = 1

         for (let octave = 0; octave < 4; octave++) {
            const period = 4 * Math.pow(2, octave)

            breeze += tileableValue(u * period, v * period, period, octave * 37) * amplitude
            amplitude *= 0.5
         }

         rawBreeze[index] = breeze
         rawDetail[index] = tileableValue(u * 8, v * 8, 8, 307) * 0.66 + tileableValue(u * 16, v * 16, 16, 419) * 0.34
         // Three octaves from a period-1 base. Two octaves from a period-2 base is smoother,
         // and it was the first thing tried, but it gives the field one dominant cell size -
         // and a field with one cell size, slid past a standing blade at a steady speed, delivers
         // a gust every thirty seconds to the second. The low base is what puts several fronts
         // of unrelated widths on any given lane.
         rawGust[index] =
            tileableValue(u, v, 1, 91) * 0.4 +
            tileableValue(u * 2, v * 2, 2, 17) * 0.34 +
            tileableValue(u * 3, v * 3, 3, 143) * 0.26
      }
   }

   const breeze = flattenHistogram(rawBreeze)
   const detail = flattenHistogram(rawDetail)
   // Flattened before the shifted copy is taken, so both channels carry the same field and
   // their difference is a real gradient rather than two different remappings of one.
   const gust = flattenHistogram(rawGust)

   for (let y = 0; y < WIND_MAP_SIZE; y++) {
      for (let x = 0; x < WIND_MAP_SIZE; x++) {
         const index = y * WIND_MAP_SIZE + x
         const pixelIndex = index * 4
         // The whole field is periodic over the texture, so wrapping the lookup is exact rather
         // than a seam that happens to be hidden.
         const leadX = (x - GUST_LEAD_TEXELS + WIND_MAP_SIZE) % WIND_MAP_SIZE

         pixels[pixelIndex] = Math.round(breeze[index] * 255)
         pixels[pixelIndex + 1] = Math.round(detail[index] * 255)
         pixels[pixelIndex + 2] = Math.round(gust[index] * 255)
         pixels[pixelIndex + 3] = Math.round(gust[y * WIND_MAP_SIZE + leadX] * 255)
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
 * triangle - the distance LOD - while two or more curve properly once the vertex shader bends
 * each row by a progressively larger angle.
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
         ...UniformsUtils.clone(UniformsLib.lights),
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
      <mesh frustumCulled={false} receiveShadow renderOrder={renderOrder}>
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
            lights
         />
      </mesh>
   )
}

interface GrassProps {
   windSettings?: GrassWindSettings
}

const Grass: React.FC<GrassProps> = ({ windSettings = DEFAULT_GRASS_WIND_SETTINGS }) => {
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
         ...createGrassWindUniforms(windSettings),
         uTerrainMinHeight: { value: fieldMap.minHeight },
         uTerrainMaxHeight: { value: fieldMap.maxHeight },
         uTerrainMidHeight: { value: (fieldMap.minHeight + fieldMap.maxHeight) / 2 },
         uCameraPosition: { value: cameraPosition },
         uSunDirection: { value: SUN_DIRECTION },
         uFrustumPlanes: { value: frustumPlanes },
         uFogColor: { value: GRASS_FOG_COLOR },
         // Half the terrain relief plus the tallest a blade can stand and sway, so the cull
         // sphere never rejects a blade that should still be on screen.
         uCullRadius: { value: (fieldMap.maxHeight - fieldMap.minHeight) / 2 + 12 },
         uDensityScale: { value: densityScale.current },
         // The trample map ping-pongs between two targets, so unlike every other texture here
         // its value changes every frame and has to be rewritten per material in the loop.
         uTrampleMap: { value: trampleField.texture() },
         uTrampleWindow: { value: trampleField.window },
      }
   }, [cameraPosition, fieldMap, frustumPlanes, playerPosition, trampleField, windMap, windSettings])

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
      applyGrassWindSettings(sharedUniforms, windSettings)
      updateGrassWindFlow(sharedUniforms, elapsed, windSettings)

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
