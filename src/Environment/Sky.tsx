import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
   AdditiveBlending,
   BackSide,
   BufferGeometry,
   Color,
   Float32BufferAttribute,
   Group,
   Object3D,
   ShaderMaterial,
   Vector3,
} from 'three'
import { MOONLIGHT_OFFSET } from '../constants'

// The sky rides along with the camera, so these are distances from the viewer rather than world
// positions. Everything stays well inside the camera's 2000 unit far plane.
const DOME_RADIUS = 900
const STAR_RADIUS = 850
const MOON_DISTANCE = 800
const MOON_QUAD_SIZE = 260

const STAR_COUNT = 1800
// Stars stop just below the horizon; the black fog swallows anything lower anyway.
const STAR_MIN_Y = -0.05

// Drawn before everything else so the world always sits in front of the sky.
const SKY_RENDER_ORDER = -1000

const MOON_DIRECTION = new Vector3(...MOONLIGHT_OFFSET).normalize()

const domeVertexShader = `
   varying vec3 vDirection;

   void main() {
      vDirection = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
   }
`

const domeFragmentShader = `
   uniform vec3 uZenithColor;
   uniform vec3 uHorizonColor;
   uniform vec3 uGlowColor;
   uniform vec3 uMoonDirection;
   varying vec3 vDirection;

   void main() {
      vec3 direction = normalize(vDirection);

      // Sit the gradient low so most of the dome stays dark and the horizon melts into the fog.
      float height = smoothstep(-0.05, 0.55, direction.y);
      vec3 color = mix(uHorizonColor, uZenithColor, height);

      // A wide, weak bloom around the moon plus a tighter core, so the moon reads as lighting the
      // sky rather than being pasted on top of it.
      float toMoon = max(dot(direction, uMoonDirection), 0.0);
      float glow = pow(toMoon, 5.0) * 0.10 + pow(toMoon, 40.0) * 0.22;
      color += uGlowColor * glow;

      gl_FragColor = vec4(color, 1.0);
   }
`

const starVertexShader = `
   uniform float uTime;
   uniform float uPixelScale;
   attribute float aSize;
   attribute float aPhase;
   attribute vec3 aColor;
   varying vec3 vColor;
   varying float vTwinkle;

   void main() {
      vColor = aColor;

      // Each star drifts on its own slow cycle, so the field shimmers instead of pulsing together.
      vTwinkle = 0.62 + 0.38 * sin(uTime * (0.5 + fract(aPhase) * 1.1) + aPhase * 6.2831);

      // Fade out near the horizon so stars never appear to hang below the treeline.
      vTwinkle *= smoothstep(-0.04, 0.22, normalize(position).y);

      gl_PointSize = aSize * uPixelScale * (0.75 + vTwinkle * 0.25);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
   }
`

const starFragmentShader = `
   varying vec3 vColor;
   varying float vTwinkle;

   void main() {
      float distanceFromCenter = length(gl_PointCoord - 0.5) * 2.0;
      float core = smoothstep(1.0, 0.0, distanceFromCenter);
      float halo = pow(max(1.0 - distanceFromCenter, 0.0), 3.0);
      float alpha = (core * 0.85 + halo * 0.35) * vTwinkle;

      if (alpha < 0.01) discard;

      gl_FragColor = vec4(vColor, alpha);
   }
`

const moonVertexShader = `
   varying vec2 vUv;

   void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
   }
`

const moonFragmentShader = `
   uniform vec3 uSurfaceColor;
   uniform vec3 uMariaColor;
   uniform vec3 uGlowColor;
   varying vec2 vUv;

   const float DISC_RADIUS = 0.26;

   // One of the dark maria on the moon's face.
   float mare(vec2 p, vec2 center, float radius, float softness) {
      return smoothstep(radius, radius * softness, length(p - center));
   }

   void main() {
      vec2 p = (vUv - 0.5) * 2.0;
      float r = length(p);

      float disc = smoothstep(DISC_RADIUS, DISC_RADIUS - 0.012, r);

      // Hand placed maria read as deliberate at this scale, and cost far less than noise.
      float maria = mare(p, vec2(-0.07, 0.06), 0.085, 0.25);
      maria += mare(p, vec2(0.05, 0.10), 0.055, 0.20) * 0.8;
      maria += mare(p, vec2(0.09, -0.04), 0.070, 0.30) * 0.7;
      maria += mare(p, vec2(-0.04, -0.10), 0.045, 0.25) * 0.6;
      maria += mare(p, vec2(-0.12, -0.03), 0.035, 0.30) * 0.5;
      maria = clamp(maria, 0.0, 1.0);

      vec3 surface = mix(uSurfaceColor, uMariaColor, maria * 0.55);

      // Gentle limb darkening away from the upper left gives the disc some roundness.
      float limb = 1.0 - smoothstep(0.35, 1.0, length(p - vec2(-0.05, 0.05) * DISC_RADIUS) / DISC_RADIUS);
      surface *= 0.78 + 0.22 * limb;

      // The halo carries most of the mood, so it reaches well past the disc itself.
      float halo = pow(max(1.0 - r, 0.0), 3.5) * 0.55;
      float bloom = smoothstep(DISC_RADIUS * 2.6, DISC_RADIUS, r) * 0.35;

      // Keep the halo mostly outside the disc, or it washes the maria straight back out.
      vec3 color = surface * disc + uGlowColor * (halo + bloom) * (1.0 - disc * 0.85);

      // Additive blending multiplies by alpha, so the falloff lives entirely in the colour and
      // alpha stays at one. Folding it into both would square the halo and choke it off.
      if (max(color.r, max(color.g, color.b)) < 0.004) discard;

      gl_FragColor = vec4(color, 1.0);
   }
`

function createStarGeometry() {
   const positions = new Float32Array(STAR_COUNT * 3)
   const colors = new Float32Array(STAR_COUNT * 3)
   const sizes = new Float32Array(STAR_COUNT)
   const phases = new Float32Array(STAR_COUNT)

   const tint = new Color()

   for (let i = 0; i < STAR_COUNT; i++) {
      // Uniform in y gives uniform coverage over the sphere, so no clumping at the zenith.
      const y = STAR_MIN_Y + Math.random() * (1 - STAR_MIN_Y)
      const ringRadius = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = Math.random() * Math.PI * 2

      positions[i * 3] = Math.cos(theta) * ringRadius * STAR_RADIUS
      positions[i * 3 + 1] = y * STAR_RADIUS
      positions[i * 3 + 2] = Math.sin(theta) * ringRadius * STAR_RADIUS

      // Heavily weighted towards faint stars, with a handful of bright ones to anchor the eye.
      sizes[i] = 1.1 + Math.pow(Math.random(), 3.2) * 5.4
      phases[i] = Math.random()

      const temperature = Math.random()
      if (temperature < 0.68) {
         tint.setRGB(0.82, 0.88, 1.0)
      } else if (temperature < 0.92) {
         tint.setRGB(0.98, 0.98, 0.96)
      } else {
         tint.setRGB(1.0, 0.85, 0.7)
      }

      colors[i * 3] = tint.r
      colors[i * 3 + 1] = tint.g
      colors[i * 3 + 2] = tint.b
   }

   const geometry = new BufferGeometry()
   geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
   geometry.setAttribute('aColor', new Float32BufferAttribute(colors, 3))
   geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1))
   geometry.setAttribute('aPhase', new Float32BufferAttribute(phases, 1))

   return geometry
}

const Stars = () => {
   const materialRef = useRef<ShaderMaterial>(null!)
   const viewportHeight = useThree((state) => state.size.height)
   const pixelRatio = useThree((state) => state.viewport.dpr)

   const geometry = useMemo(() => createStarGeometry(), [])
   useEffect(() => () => geometry.dispose(), [geometry])

   const uniforms = useMemo(
      () => ({
         uTime: { value: 0 },
         uPixelScale: { value: 1 },
      }),
      []
   )

   // Hold stars at a constant angular size rather than a constant pixel size, so they neither
   // balloon on a small window nor vanish on a large one.
   useEffect(() => {
      uniforms.uPixelScale.value = (viewportHeight / 900) * pixelRatio
   }, [uniforms, viewportHeight, pixelRatio])

   useFrame(({ clock }) => {
      if (materialRef.current) {
         materialRef.current.uniforms.uTime.value = clock.elapsedTime
      }
   })

   return (
      <points geometry={geometry} renderOrder={SKY_RENDER_ORDER + 1} frustumCulled={false}>
         <shaderMaterial
            ref={materialRef}
            uniforms={uniforms}
            vertexShader={starVertexShader}
            fragmentShader={starFragmentShader}
            transparent={true}
            depthWrite={false}
            blending={AdditiveBlending}
         />
      </points>
   )
}

const Moon = () => {
   // The sky group is centred on the camera, so the moon's facing never changes once set.
   const { position, quaternion } = useMemo(() => {
      const moonPosition = MOON_DIRECTION.clone().multiplyScalar(MOON_DISTANCE)
      const orienter = new Object3D()
      orienter.position.copy(moonPosition)
      orienter.lookAt(0, 0, 0)
      return { position: moonPosition, quaternion: orienter.quaternion.clone() }
   }, [])

   const uniforms = useMemo(
      () => ({
         uSurfaceColor: { value: new Color('#eef3ff') },
         uMariaColor: { value: new Color('#9fb0cc') },
         uGlowColor: { value: new Color('#7ea3d8') },
      }),
      []
   )

   return (
      <mesh position={position} quaternion={quaternion} renderOrder={SKY_RENDER_ORDER + 2} frustumCulled={false}>
         <planeGeometry args={[MOON_QUAD_SIZE, MOON_QUAD_SIZE]} />
         <shaderMaterial
            uniforms={uniforms}
            vertexShader={moonVertexShader}
            fragmentShader={moonFragmentShader}
            transparent={true}
            depthWrite={false}
            blending={AdditiveBlending}
         />
      </mesh>
   )
}

const SkyDome = () => {
   const uniforms = useMemo(
      () => ({
         uZenithColor: { value: new Color('#0a1226') },
         uHorizonColor: { value: new Color('#01030a') },
         uGlowColor: { value: new Color('#4a6da3') },
         uMoonDirection: { value: MOON_DIRECTION.clone() },
      }),
      []
   )

   return (
      <mesh renderOrder={SKY_RENDER_ORDER} frustumCulled={false}>
         <sphereGeometry args={[DOME_RADIUS, 32, 16]} />
         <shaderMaterial
            uniforms={uniforms}
            vertexShader={domeVertexShader}
            fragmentShader={domeFragmentShader}
            side={BackSide}
            depthWrite={false}
            depthTest={false}
         />
      </mesh>
   )
}

export default function Sky() {
   const groupRef = useRef<Group>(null!)

   // Following the camera is what makes the sky read as infinitely far away: the player can walk
   // to the far corner of the world and the moon stays put.
   useFrame(({ camera }) => {
      groupRef.current?.position.copy(camera.position)
   })

   return (
      <group ref={groupRef}>
         <SkyDome />
         <Stars />
         <Moon />
      </group>
   )
}
