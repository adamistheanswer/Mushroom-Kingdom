import React, { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh, MeshBasicMaterial } from 'three'

const EFFECT_DURATION = 2.2
const LEAF_COUNT = 36

const leafColors = ['#7bd66f', '#4fa85d', '#b8e06f', '#d6f08d']

const SpawnEffect: React.FC = () => {
   const groupRef = useRef<Group>(null!)
   const ringRef = useRef<Mesh>(null!)
   const glowRef = useRef<Mesh>(null!)
   const ringMaterialRef = useRef<MeshBasicMaterial>(null!)
   const glowMaterialRef = useRef<MeshBasicMaterial>(null!)
   const leafRefs = useRef<Mesh[]>([])
   const leafMaterialsRef = useRef<MeshBasicMaterial[]>([])
   const elapsedRef = useRef(0)
   const [visible, setVisible] = useState(true)

   const leaves = useMemo(
      () =>
         Array.from({ length: LEAF_COUNT }, (_, index) => {
            const angle = (index / LEAF_COUNT) * Math.PI * 2 + Math.random() * 0.45
            const radius = 3.4 + Math.random() * 3.4

            return {
               angle,
               color: leafColors[index % leafColors.length],
               drift: 1.1 + Math.random() * 1.6,
               height: 3.8 + Math.random() * 4.4,
               radius,
               scale: 0.32 + Math.random() * 0.28,
               spin: (Math.random() > 0.5 ? 1 : -1) * (1.8 + Math.random() * 2.2),
               startDelay: Math.random() * 0.35,
            }
         }),
      []
   )

   useFrame((_, delta) => {
      if (!visible) {
         return
      }

      elapsedRef.current += delta
      const progress = Math.min(elapsedRef.current / EFFECT_DURATION, 1)
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const fade = 1 - progress

      if (groupRef.current) {
         groupRef.current.visible = visible
      }

      if (ringRef.current && ringMaterialRef.current) {
         const scale = 0.8 + easeOut * 4.4
         ringRef.current.scale.set(scale, scale, scale)
         ringMaterialRef.current.opacity = fade * 0.72
      }

      if (glowRef.current && glowMaterialRef.current) {
         const scale = 1.4 + easeOut * 5.2
         glowRef.current.scale.set(scale, scale, scale)
         glowMaterialRef.current.opacity = fade * 0.3
      }

      leaves.forEach((leaf, index) => {
         const mesh = leafRefs.current[index]
         const material = leafMaterialsRef.current[index]
         if (!mesh || !material) {
            return
         }

         const leafProgress = Math.max(0, Math.min((elapsedRef.current - leaf.startDelay) / (EFFECT_DURATION - leaf.startDelay), 1))
         const leafEase = 1 - Math.pow(1 - leafProgress, 2)
         const swirl = leaf.angle + leafEase * leaf.drift
         const radius = leaf.radius * (0.82 + leafEase * 0.45)

         mesh.position.set(Math.cos(swirl) * radius, 0.35 + leafEase * leaf.height, Math.sin(swirl) * radius)
         mesh.rotation.set(leafEase * Math.PI * 1.8, swirl, leafEase * leaf.spin)
         material.opacity = Math.sin(leafProgress * Math.PI) * 0.85
      })

      if (progress >= 1) {
         setVisible(false)
      }
   })

   if (!visible) {
      return null
   }

   return (
      <group ref={groupRef}>
         <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
            <torusGeometry args={[1.8, 0.07, 10, 96]} />
            <meshBasicMaterial ref={ringMaterialRef} color="#b9ff8a" transparent={true} opacity={0.72} depthWrite={false} />
         </mesh>
         <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
            <circleGeometry args={[1.3, 64]} />
            <meshBasicMaterial ref={glowMaterialRef} color="#77d866" transparent={true} opacity={0.3} depthWrite={false} />
         </mesh>
         {leaves.map((leaf, index) => (
            <mesh
               key={`${leaf.angle}-${index}`}
               ref={(mesh) => {
                  if (mesh) {
                     leafRefs.current[index] = mesh
                  }
               }}
               scale={[leaf.scale * 0.55, leaf.scale, leaf.scale]}
            >
               <circleGeometry args={[1, 5]} />
               <meshBasicMaterial
                  ref={(material) => {
                     if (material) {
                        leafMaterialsRef.current[index] = material
                     }
                  }}
                  color={leaf.color}
                  transparent={true}
                  opacity={0}
                  depthWrite={false}
               />
            </mesh>
         ))}
      </group>
   )
}

export default SpawnEffect
