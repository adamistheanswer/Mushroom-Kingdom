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

export function AvatarAnimated(props: JSX.IntrinsicElements['group']) {
   const group = useRef<THREE.Group>(null!)

   const { materials, animations, nodes } = useSkinnedMeshClone(
      '../Models/Player/FullMushy.gltf'
   )

   const { actions } = useAnimations<GLTFActions>(animations, group)

   useEffect(() => {
      actions['Excited']!.play()
   })

   return (
      <group ref={group} {...props} dispose={null}>
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
            {/* <group name="cs_grp">
               <group name="cs_arm_fk" position={[1.5, 8.5, 0]} scale={0.82} />
               <group name="cs_calf_fk" position={[0.5, 8.5, 0]} scale={0.82} />
               <group name="cs_circle" position={[0.5, 4.5, 0]} scale={0.21} />
               <group
                  name="cs_foot"
                  position={[0.5, 10.5, 0]}
                  rotation={[-Math.PI, 0, 0]}
                  scale={0.31}
               />
               <group
                  name="cs_foot001"
                  position={[0.5, 10.5, 0]}
                  rotation={[-Math.PI, 0, 0]}
                  scale={0.31}
               />
               <group
                  name="cs_foot002"
                  position={[0.5, 10.5, 0]}
                  rotation={[-Math.PI, 0, 0]}
                  scale={0.31}
               />
               <group
                  name="cs_foot_01"
                  position={[0.5, 18.5, 0]}
                  rotation={[0, Math.PI / 2, 0]}
                  scale={2.19}
               />
               <group
                  name="cs_foot_roll"
                  position={[0.5, 12.5, 0]}
                  scale={0.59}
               />
               <group
                  name="cs_forearm_fk"
                  position={[2.5, 8.5, 0]}
                  scale={0.82}
               />
               <group
                  name="cs_hand"
                  position={[0.5, 19.5, 0]}
                  rotation={[-Math.PI, 0, 0]}
                  scale={0.31}
               />
               <group name="cs_head" position={[0.5, 13.5, 0]} scale={0.21} />
               <group name="cs_hips" position={[0.5, 11.5, 0]} scale={0.21} />
               <group name="cs_master" position={[0.5, 17.5, 0]} scale={0.1} />
               <group name="cs_neck" position={[0.5, 14.5, 0]} scale={0.21} />
               <group
                  name="cs_shoulder_left"
                  position={[0.5, 15.5, 0]}
                  rotation={[-Math.PI, -Math.PI / 2, 0]}
                  scale={1.04}
               />
               <group
                  name="cs_shoulder_right"
                  position={[0.5, 16.5, 0]}
                  rotation={[-Math.PI, -Math.PI / 2, 0]}
                  scale={1.04}
               />
               <group name="cs_sphere" position={[0.5, 2.5, 0]} scale={0.21} />
               <group
                  name="cs_sphere_012"
                  position={[3.5, 2.5, 0]}
                  scale={0.21}
               />
               <group
                  name="cs_square"
                  position={[1.5, 1.5, 0]}
                  rotation={[-Math.PI, 0, 0]}
                  scale={0.15}
               />
               <group
                  name="cs_square_2"
                  position={[0.5, 1.5, 0]}
                  rotation={[-Math.PI, 0, 0]}
                  scale={0.15}
               />
               <group
                  name="cs_thigh_fk"
                  position={[0.5, 7.5, 0]}
                  scale={0.82}
               />
               <group name="cs_toe" position={[0.5, 9.5, 0]} scale={0.43} />
            </group> */}
         </group>
      </group>
   )
}

useGLTF.preload('../Models/Player/FullMushy.gltf')
