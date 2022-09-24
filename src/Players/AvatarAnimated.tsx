import * as THREE from 'three'
import React, { useRef, useEffect, useMemo } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'
import { GLTF } from 'three-stdlib'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'
import { useGraph } from '@react-three/fiber'

type GLTFResult = GLTF & {
   nodes: {
      Circle001: THREE.SkinnedMesh
      mixamorigHips: THREE.Bone
      Ctrl_ArmPole_IK_Left: THREE.Bone
      Ctrl_Hand_IK_Left: THREE.Bone
      Ctrl_ArmPole_IK_Right: THREE.Bone
      Ctrl_Hand_IK_Right: THREE.Bone
      Ctrl_Foot_IK_Left: THREE.Bone
      Ctrl_LegPole_IK_Left: THREE.Bone
      Ctrl_Foot_IK_Right: THREE.Bone
      Ctrl_LegPole_IK_Right: THREE.Bone
      Ctrl_Master: THREE.Bone
   }
   materials: {
      corpo: THREE.MeshStandardMaterial
   }
}

type ActionName =
   | 'Dance'
   | 'Dance2'
   | 'Excited'
   | 'Idle'
   | 'Punch'
   | 'Salute'
   | 'StrafeLeft'
   | 'StrafeRight'
   | 'Walking'
   | 'WalkingB'
   | 'Waving'
type GLTFActions = Record<ActionName, THREE.AnimationAction>

function useSkinnedMeshClone(path) {
   const { scene, materials, animations } = useGLTF(path) as GLTFResult
   const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene])
   const { nodes } = useGraph(clonedScene)

   return { scene: clonedScene, materials, animations, nodes }
}

export function AvatarAnimated({ rotation, position, playerActions }) {
   let actionsInit

   if (playerActions.length === 0) {
      actionsInit = 'Idle'
   } else {
      actionsInit = playerActions
   }

   const group = useRef<THREE.Group>(null!)
   const previousAction = usePrevious(actionsInit)
   const { materials, animations, nodes } = useSkinnedMeshClone('../Models/Player/Anims/FullMushy.gltf')

   const { actions, names } = useAnimations<GLTFActions>(animations, group)

   useEffect(() => {
      let currentArr = actionsInit.split(',')
      currentArr.forEach((action) => {
         actions[action]?.reset().fadeIn(0.4).play()
      })

      return () =>
         void currentArr.forEach((action) => {
            actions[action]?.fadeOut(0.4)
         })
   }, [actions, actionsInit])

   return (
      <group ref={group} rotation={rotation} position={position} dispose={null}>
         <group name="Scene" scale={1.6}>
            <group name="Mushy">
               <primitive object={nodes.mixamorigHips} />
               <primitive object={nodes.Ctrl_ArmPole_IK_Left} />
               <primitive object={nodes.Ctrl_Hand_IK_Left} />
               <primitive object={nodes.Ctrl_ArmPole_IK_Right} />
               <primitive object={nodes.Ctrl_Hand_IK_Right} />
               <primitive object={nodes.Ctrl_Foot_IK_Left} />
               <primitive object={nodes.Ctrl_LegPole_IK_Left} />
               <primitive object={nodes.Ctrl_Foot_IK_Right} />
               <primitive object={nodes.Ctrl_LegPole_IK_Right} />
               <primitive object={nodes.Ctrl_Master} />
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

useGLTF.preload('../Models/Player/FullMushy.gltf')

function usePrevious(value) {
   const ref = useRef('Idle')

   useEffect(() => {
      ref.current = value
   }, [value])

   return ref.current
}
