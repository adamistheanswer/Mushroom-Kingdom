import React, { useRef, useEffect, useMemo, useState } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'
import { GLTF } from 'three-stdlib'
import { clone as SkeletonUtilsClone } from 'three/examples/jsm/utils/SkeletonUtils'
import { useGraph } from '@react-three/fiber'
import { actionsArr } from '../Utils/playerActionsToIndexes'
import { Bone, SkinnedMesh, MeshStandardMaterial, Vector3, Euler, AnimationAction, Group } from 'three'

interface AvatarProps {
   position: Vector3
   rotation: Euler
   action?: string
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
type GLTFActions = Record<ActionName, AnimationAction>

function useSkinnedMeshClone(path) {
   const { scene, materials, animations } = useGLTF(path) as GLTFResult
   const clonedScene = useMemo(() => SkeletonUtilsClone(scene), [scene])
   const { nodes } = useGraph(clonedScene)
   return { scene: clonedScene, materials, animations, nodes }
}

export const Avatar = React.memo<AvatarProps>(
   ({ position = new Vector3(0, 0, 0), rotation = new Euler(0, 0, 0), action }) => {
      const [currentAction, setCurrentAction] = useState(action ?? '3')

      useEffect(() => {
         if (action !== undefined) {
            setCurrentAction(action)
         }
      }, [action])

      const avatarRef = useRef<Group>(null!)

      useEffect(() => {
         avatarRef.current.position.copy(position)
      }, [position])

      useEffect(() => {
         avatarRef.current.rotation.copy(rotation)
         avatarRef.current.rotation.y = avatarRef.current.rotation.y + Math.PI
      }, [rotation])

      const { animations, nodes } = useSkinnedMeshClone('../Models/Player/FullMushy.glb')
      // @ts-ignore
      const { actions } = useAnimations<GLTFActions>(animations, avatarRef)

      useEffect(() => {
         let currentArr = currentAction.split(',')
         currentArr.forEach((index) => {
            actions[actionsArr[index]]?.reset().fadeIn(0.4).play()
         })

         return () =>
            void currentArr.forEach((index) => {
               actions[actionsArr[index]]?.fadeOut(0.4)
            })
      }, [actions, currentAction])

      return (
         <group name="Scene" scale={1.6} ref={avatarRef} dispose={null}>
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
                  //@ts-ignore
                  geometry={nodes.Circle001.geometry}
                  //@ts-ignore
                  material={nodes.Circle001.material}
                  //@ts-ignore
                  skeleton={nodes.Circle001.skeleton}
               />
            </group>
         </group>
      )
   }
)

useGLTF.preload('../Models/Player/FullMushy.glb')
