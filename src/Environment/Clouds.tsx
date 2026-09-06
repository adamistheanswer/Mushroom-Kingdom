import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, Color, ShaderMaterial, Vector2 } from 'three'
import { environment } from './dayNightState'

const NIGHT_SHADE = new Color('#42536f')
const DAY_SHADE = new Color('#d5e2ec')
const NIGHT_EDGE = new Color('#a4b7d3')
const DAY_EDGE = new Color('#fffdf5')
const TWILIGHT_SHADE = new Color('#b99aab')
const TWILIGHT_EDGE = new Color('#ffdbb4')

const vertexShader = `
   varying vec3 vDirection;
   void main() {
      vDirection = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
   }
`

const fragmentShader = `
   uniform vec2 uDrift;
   uniform vec3 uShade;
   uniform vec3 uEdge;
   uniform vec3 uLightDirection;
   uniform float uDirectStrength;
   varying vec3 vDirection;

   float hash(vec2 p) {
      vec3 q = fract(vec3(p.xyx) * 0.1031);
      q += dot(q, q.yzx + 33.33);
      return fract((q.x + q.y) * q.z);
   }

   float noise(vec2 p) {
      vec2 cell = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
                 mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x), f.y);
   }

   float cloudField(vec2 p) {
      float value = 0.0;
      float weight = 0.55;
      for (int octave = 0; octave < 4; octave++) {
         value += noise(p) * weight;
         p = mat2(1.6, -1.2, 1.2, 1.6) * p + 17.3;
         weight *= 0.5;
      }
      return value;
   }

   void main() {
      vec3 direction = normalize(vDirection);
      float horizonFade = smoothstep(0.015, 0.12, direction.y);
      if (horizonFade <= 0.001) discard;

      // Project onto a high cloud layer, with a bounded scale at the horizon to avoid shimmer.
      // World directions keep the pattern continuous across the sphere's UV seam.
      vec2 p = direction.xz / max(0.18, direction.y + 0.12) * 2.2 + uDrift;
      float field = cloudField(p);
      // Only the highest-density pockets remain as scattered clouds.
      float density = smoothstep(0.60, 0.75, field);
      float alpha = density * horizonFade * 0.88;
      if (alpha < 0.005) discard;

      float facingLight = pow(max(dot(direction, uLightDirection), 0.0), 6.0);
      float rim = (1.0 - density) * facingLight * uDirectStrength;
      vec3 color = mix(uShade, uEdge, clamp(0.42 + (1.0 - density) * 0.30 + rim * 0.55, 0.0, 1.0));
      gl_FragColor = vec4(color, alpha);
   }
`

// One transparent sky layer: no textures, volumetric ray marching or extra shadow maps.
// It shares Sky's camera-centred group and renders over celestial bodies, behind scenery.
export default function Clouds() {
   const materialRef = useRef<ShaderMaterial>(null!)
   const uniforms = useMemo(
      () => ({
         uDrift: { value: new Vector2() },
         uShade: { value: new Color() },
         uEdge: { value: new Color() },
         uLightDirection: { value: environment.primaryDirection },
         uDirectStrength: { value: 0 },
      }),
      []
   )

   useFrame(() => {
      const material = materialRef.current
      if (!material) return
      const { daylight, twilight } = environment
      material.uniforms.uDrift.value.copy(environment.cloudDrift)
      material.uniforms.uShade.value
         .copy(NIGHT_SHADE)
         .lerp(DAY_SHADE, daylight)
         .lerp(TWILIGHT_SHADE, twilight * 0.65)
      material.uniforms.uEdge.value
         .copy(NIGHT_EDGE)
         .lerp(DAY_EDGE, daylight)
         .lerp(TWILIGHT_EDGE, twilight * 0.8)
      material.uniforms.uDirectStrength.value = environment.directStrength
   })

   return (
      <mesh renderOrder={-997} frustumCulled={false}>
         <sphereGeometry args={[760, 32, 20]} />
         <shaderMaterial
            ref={materialRef}
            uniforms={uniforms}
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            side={BackSide}
            transparent
            depthWrite={false}
         />
      </mesh>
   )
}
