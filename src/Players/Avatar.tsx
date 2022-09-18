import * as THREE from 'three'
import React, { useRef, useEffect, useMemo } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'
import { GLTF } from 'three-stdlib'
import { AnimationClip, Group } from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'
import { useGraph } from '@react-three/fiber'

type GLTFResult = GLTF & {
   nodes: {
      Circle001: THREE.SkinnedMesh
      mixamorigHips: THREE.Bone
   }
   materials: {
      corpo: THREE.MeshStandardMaterial
   }
}

function useSkinnedMeshClone(path) {
   const { scene, materials, animations } = useGLTF(path) as GLTFResult
   const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene])
   const { nodes } = useGraph(clonedScene)

   return { scene: clonedScene, materials, animations, nodes }
}

type ActionName = 'Armature|mixamo.com|Layer0'
type GLTFActions = Record<ActionName, THREE.AnimationAction>

export function Avatar(props: JSX.IntrinsicElements['group']) {
   const group = useRef<Group>(null!)
   // const { nodes, materials, animations } = useGLTF(
   //    '../Models/Player/test.gltf'
   // ) as GLTFResult

   const { materials, animations, nodes } = useSkinnedMeshClone(
      '../Models/Player/walking.gltf'
   )
   const { actions } = useAnimations<AnimationClip>(animations, group)

   useEffect(() => {
      actions['Armature|mixamo.com|Layer0']!.play()
   })

   return (
      <group ref={group} {...props} dispose={null}>
         <group name="Scene">
            <group name="Armature" rotation={[Math.PI / 2, 0, 0]} scale={0.015}>
               <primitive object={nodes.mixamorigHips} />
               <skinnedMesh
                  castShadow
                  receiveShadow
                  name="Circle001"
                  geometry={nodes.Circle001.geometry}
                  material={materials.corpo}
                  skeleton={nodes.Circle001.skeleton}
               />
            </group>
         </group>
      </group>
   )
}

useGLTF.preload('../Models/Player/walking.gltf')
