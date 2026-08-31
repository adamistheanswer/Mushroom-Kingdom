import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from 'three'
import { WORLD_HALF_SIZE, WORLD_SIZE } from '../constants'

const WALL_HEIGHT = 70
const WALL_Y = WALL_HEIGHT / 2

const vertexShader = `
   varying vec2 vUv;

   void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
   }
`

const fragmentShader = `
   uniform float uTime;
   uniform vec3 uBaseColor;
   uniform vec3 uGlowColor;
   varying vec2 vUv;

   float stripe(float x, float width) {
      return smoothstep(width, 0.0, abs(fract(x) - 0.5));
   }

   void main() {
      float verticals = stripe(vUv.x * 38.0 + sin(uTime * 0.35) * 0.05, 0.22);
      float canopy = smoothstep(0.24, 0.88, vUv.y) * (0.55 + 0.45 * sin(vUv.x * 42.0 + uTime));
      float shimmer = 0.5 + 0.5 * sin((vUv.x * 18.0) + (vUv.y * 9.0) + uTime * 2.4);
      float bottomFade = smoothstep(0.0, 0.14, vUv.y);
      float topFade = 1.0 - smoothstep(0.9, 1.0, vUv.y);
      float alpha = (0.26 + shimmer * 0.12 + canopy * 0.15 + verticals * 0.08) * bottomFade * topFade;
      vec3 color = mix(uBaseColor, uGlowColor, shimmer * 0.32 + canopy * 0.28);
      color = mix(color, vec3(0.02, 0.09, 0.035), verticals * 0.45);

      gl_FragColor = vec4(color, alpha);
   }
`

const wallTransforms = [
   { position: [0, WALL_Y, WORLD_HALF_SIZE], rotation: [0, 0, 0] },
   { position: [0, WALL_Y, -WORLD_HALF_SIZE], rotation: [0, Math.PI, 0] },
   { position: [WORLD_HALF_SIZE, WALL_Y, 0], rotation: [0, Math.PI / 2, 0] },
   { position: [-WORLD_HALF_SIZE, WALL_Y, 0], rotation: [0, -Math.PI / 2, 0] },
]

const BoundaryWall = ({ position, rotation }) => {
   const materialRef = useRef<ShaderMaterial>(null!)
   const uniforms = useMemo(
      () => ({
         uTime: { value: 0 },
         uBaseColor: { value: new Color('#0f3b1f') },
         uGlowColor: { value: new Color('#8cffb0') },
      }),
      []
   )

   useFrame(({ clock }) => {
      if (materialRef.current) {
         materialRef.current.uniforms.uTime.value = clock.elapsedTime
      }
   })

   return (
      <mesh position={position} rotation={rotation} renderOrder={1}>
         <planeGeometry args={[WORLD_SIZE, WALL_HEIGHT, 96, 12]} />
         <shaderMaterial
            ref={materialRef}
            uniforms={uniforms}
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            transparent={true}
            depthWrite={false}
            side={DoubleSide}
            blending={AdditiveBlending}
         />
      </mesh>
   )
}

const BoundaryWalls = () => {
   return (
      <>
         {wallTransforms.map((transform) => (
            <BoundaryWall key={transform.position.toString()} {...transform} />
         ))}
      </>
   )
}

export default BoundaryWalls
