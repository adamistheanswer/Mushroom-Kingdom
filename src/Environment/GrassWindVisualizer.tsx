import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, DoubleSide, Mesh, ShaderMaterial } from 'three'
import {
   GRASS_WIND_SAMPLE_GLSL,
   GRASS_WIND_UNIFORMS_GLSL,
   applyGrassWindSettings,
   createGrassWindUniforms,
   createWindTexture,
   updateGrassWindFlow,
   type GrassWindSettings,
} from './Grass'

interface GrassWindVisualizerProps {
   settings: GrassWindSettings
   height: number
   opacity: number
   size: number
}

const VISUALIZER_SEGMENTS = 96

const vertexShader = `
   varying vec2 vWorldXZ;

   void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldXZ = worldPosition.xz;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
   }
`

// The plane runs the same sampler the blades do, so the three layers can be told apart at a
// glance and tuned separately: teal is the breeze that is always there, blue is the body of a
// gust, and white is its leading edge. If the blue bands arrive on a beat, or the white edges
// are as wide as the bands behind them, that is visible here long before it is visible in the
// grass itself.
const fragmentShader = `
   uniform float uOpacity;

   ${GRASS_WIND_UNIFORMS_GLSL}

   varying vec2 vWorldXZ;

   ${GRASS_WIND_SAMPLE_GLSL}

   void main() {
      GrassWindSample wind = sampleGrassWind(vWorldXZ, 0.54, 0.0, 0.5);

      vec3 color = vec3(0.01, 0.025, 0.035) +
         vec3(0.16, 0.48, 0.42) * wind.breeze * 3.4 +
         vec3(0.08, 0.5, 1.0) * wind.gust * 0.8 +
         vec3(1.0, 0.98, 0.86) * wind.crest * 1.6 +
         vec3(0.7, 1.0, 0.72) * max(wind.sway, 0.0) * 0.35;
      float alpha = uOpacity * (0.1 + wind.breeze * 0.9 + wind.gust * 0.45 + wind.crest * 0.7);

      gl_FragColor = vec4(color, alpha);
   }
`

const GrassWindVisualizer: React.FC<GrassWindVisualizerProps> = ({ settings, height, opacity, size }) => {
   const meshRef = useRef<Mesh>(null!)
   const materialRef = useRef<ShaderMaterial>(null!)
   const windMap = useMemo(() => createWindTexture(), [])

   const uniforms = useMemo(
      () => ({
         uTime: { value: 0 },
         uOpacity: { value: opacity },
         uWindMap: { value: windMap },
         ...createGrassWindUniforms(settings),
      }),
      [opacity, settings, windMap]
   )

   useEffect(() => () => windMap.dispose(), [windMap])

   useFrame((state) => {
      const controlsTarget = state.controls?.target
      const localX = controlsTarget?.x ?? state.camera.position.x
      const localZ = controlsTarget?.z ?? state.camera.position.z

      if (materialRef.current) {
         materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
         materialRef.current.uniforms.uOpacity.value = opacity
         applyGrassWindSettings(materialRef.current.uniforms, settings)
         updateGrassWindFlow(materialRef.current.uniforms, state.clock.elapsedTime, settings)
      }

      if (meshRef.current) {
         meshRef.current.position.set(localX, height, localZ)
      }
   })

   return (
      <mesh ref={meshRef} name="grass-wind-visualizer" rotation={[-Math.PI / 2, 0, 0]} renderOrder={20}>
         <planeGeometry args={[size, size, VISUALIZER_SEGMENTS, VISUALIZER_SEGMENTS]} />
         <shaderMaterial
            ref={materialRef}
            uniforms={uniforms}
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            side={DoubleSide}
            transparent
            depthWrite={false}
            depthTest={false}
            blending={AdditiveBlending}
         />
      </mesh>
   )
}

export default GrassWindVisualizer
