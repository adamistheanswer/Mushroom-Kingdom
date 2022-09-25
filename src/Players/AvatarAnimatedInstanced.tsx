/*
Auto-generated by: https://github.com/pmndrs/gltfjsx
*/

import * as THREE from 'three'
import React, {
   useRef,
   useMemo,
   useContext,
   createContext,
   useEffect,
} from 'react'
import { useGLTF, Merged, useAnimations } from '@react-three/drei'
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

const context = createContext()

function useSkinnedMeshClone(path) {
   const { scene, materials, animations } = useGLTF(path) as GLTFResult
   const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene])
   const { nodes } = useGraph(clonedScene)

   return { scene: clonedScene, materials, animations, nodes }
}

export function Instances({ children, ...props }) {
   const { nodes, animations } = useGLTF(
      '../Models/Player/FullMushy-transformed.glb'
   ) as GLTFResult

   let skinnedMesh = nodes.Circle001

   skinnedMesh.castShadow = true
   skinnedMesh.receiveShadow = true
   //  console.log(nodes.Circle001)
   const instances = useMemo(
      () => ({
         Circle: skinnedMesh,
      }),
      [nodes, animations]
   )
   return (
      <Merged meshes={instances} {...props}>
         {(instances) => (
            <context.Provider value={instances} children={children} />
         )}
      </Merged>
   )
}

export function AvatarAnimatedInstanced(props: JSX.IntrinsicElements['group']) {
   const { animations, nodes } = useSkinnedMeshClone(
      '../Models/Player/FullMushy.gltf'
   )

   const instances = useContext(context)
   const group = useRef<THREE.Group>()
   const { actions } = useAnimations<GLTFActions>(animations, group)

   //  console.log(instances)

   useEffect(() => {
      actions['Dance'].play()
   })

   return (
      <group ref={group} {...props} dispose={null}>
         <group name="Scene" scale={1.6}>
            <group name="Mushy">
               <primitive object={nodes.mixamorigHips} />
               <primitive object={nodes.Ctrl_ArmPole_IK_Left} />a
               <primitive object={nodes.Ctrl_Hand_IK_Left} />
               <primitive object={nodes.Ctrl_ArmPole_IK_Right} />
               <primitive object={nodes.Ctrl_Hand_IK_Right} />
               <primitive object={nodes.Ctrl_Foot_IK_Left} />
               <primitive object={nodes.Ctrl_LegPole_IK_Left} />
               <primitive object={nodes.Ctrl_Foot_IK_Right} />
               <primitive object={nodes.Ctrl_LegPole_IK_Right} />
               <primitive object={nodes.Ctrl_Master} />
               <instances.Circle castShadow receiveShadow name="Circle001" />
            </group>
         </group>
      </group>
   )
}

// useGLTF.preload('/FullMushy-transformed.glb')
useGLTF.preload('../Models/Player/FullMushy-transformed.glb')