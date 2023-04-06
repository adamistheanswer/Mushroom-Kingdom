import React, { useRef, useEffect, useMemo, useState } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'
import { GLTF } from 'three-stdlib'
import { clone as SkeletonUtilsClone } from 'three/examples/jsm/utils/SkeletonUtils'
import { useGraph, useThree } from '@react-three/fiber'
import { Bone, SkinnedMesh, MeshStandardMaterial } from 'three'
import { actionsArr } from '../Utils/playerActionsToIndexes'
import { Vector3, Euler } from 'three'

interface AvatarAnimatedProps {
   position: Vector3
   rotation: Euler
}

type GLTFResult = GLTF & {
   nodes: {
      Circle001: SkinnedMesh
      mixamorigHips: Bone
      Ctrl_ArmPole_IK_Left: Bone
      Ctrl_Hand_IK_Left: Bone
      Ctrl_ArmPole_IK_Right: Bone
      Ctrl_Hand_IK_Right: Bone
      Ctrl_Foot_IK_Left: Bone
      Ctrl_LegPole_IK_Left: Bone
      Ctrl_Foot_IK_Right: Bone
      Ctrl_LegPole_IK_Right: Bone
      Ctrl_Master: Bone
   }
   materials: {
      corpo: MeshStandardMaterial
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
   const clonedScene = useMemo(() => SkeletonUtilsClone(scene), [scene])
   const { nodes } = useGraph(clonedScene)
   return { scene: clonedScene, materials, animations, nodes }
}

export const AvatarAnimated = React.memo<AvatarAnimatedProps>(
   ({ position = new Vector3(0, 0, 0), rotation = new Euler(0, 0, 0) }) => {
      const [action, setAction] = useState('3')
      const group = useRef<THREE.Group>(null!)

      useEffect(() => {
         group.current.position.copy(position)
      }, [position])

      useEffect(() => {
         group.current.rotation.copy(rotation)
      }, [rotation])

      const { materials, animations, nodes } = useSkinnedMeshClone('../Models/Player/FullMushy.gltf')
      // @ts-ignore
      const { actions } = useAnimations<GLTFActions>(animations, group)

      useEffect(() => {
         let currentArr = action.split(',')
         currentArr.forEach((index) => {
            actions[actionsArr[index]]?.reset().fadeIn(0.4).play()
         })

         return () =>
            void currentArr.forEach((index) => {
               actions[actionsArr[index]]?.fadeOut(0.4)
            })
      }, [actions, action])

      return (
         <>
            <group ref={group} dispose={null}>
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
         </>
      )
   }
)

useGLTF.preload('../Models/Player/FullMushy.gltf')