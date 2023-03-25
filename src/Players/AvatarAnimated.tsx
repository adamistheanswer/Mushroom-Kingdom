import React, { useRef, useEffect, useMemo, useState } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'
import { GLTF } from 'three-stdlib'
import { clone as SkeletonUtilsClone } from 'three/examples/jsm/utils/SkeletonUtils'
import { useFrame, useGraph, useThree } from '@react-three/fiber'
import { Bone, SkinnedMesh, MeshStandardMaterial } from 'three'
import { Text } from '@react-three/drei'

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

export function AvatarAnimated({ client, clientSocket, isLocal }) {
   const [action, setAction] = useState('Idle')
   const group = useRef<THREE.Group>(null!)
   const avatarRef = useRef<THREE.Group>(null!)
   const nameplateRef = useRef<THREE.Group>(null!)
   const { camera } = useThree()
   const previousAction = usePrevious(action)
   const nameplateHeight = 13
   const { materials, animations, nodes } = useSkinnedMeshClone('../Models/Player/FullMushy.gltf')
   // @ts-ignore
   const { actions } = useAnimations<GLTFActions>(animations, group)

   useEffect(() => {
      if (previousAction) {
         actions[previousAction].fadeOut(0.2)
         actions[action].stop()
      }
      actions[action].play()
      actions[action].fadeIn(0.2)
   }, [actions, action, previousAction])

   useFrame(() => {
      if (isLocal) {
         nameplateRef.current.rotation.x = 0
         nameplateRef.current.rotation.y = 0
         nameplateRef.current.rotation.z = 0
      } else {
         nameplateRef.current.rotation.x = camera.rotation.x
         nameplateRef.current.rotation.y = camera.rotation.y
         nameplateRef.current.rotation.z = camera.rotation.z
      }
   })

   useEffect(() => {
      if (clientSocket) {
         clientSocket.on('clientUpdates', (updatedClients) => {
            setAction(updatedClients[client]?.s)
            if (isLocal) {
               avatarRef.current.rotation.x = 0
               avatarRef.current.rotation.y = Math.PI
               avatarRef.current.rotation.z = 0
               nameplateRef.current.position.x = 0
               nameplateRef.current.position.y = nameplateHeight
               nameplateRef.current.position.z = 0
            } else {
               if (avatarRef.current) {
                  avatarRef.current.rotation.x = 0
                  avatarRef.current.rotation.y = Math.PI + updatedClients[client]?.r
                  avatarRef.current.rotation.z = 0
                  avatarRef.current.position.x = updatedClients[client]?.p[0]
                  avatarRef.current.position.y = 0
                  avatarRef.current.position.z = updatedClients[client]?.p[2]
               }
               if (nameplateRef.current) {
                  nameplateRef.current.position.x = updatedClients[client]?.p[0]
                  nameplateRef.current.position.y = nameplateHeight
                  nameplateRef.current.position.z = updatedClients[client]?.p[2]
               }
            }
         })
      }
   }, [clientSocket])

   return (
      <>
         <Text ref={nameplateRef} fontSize={1} color={isLocal ? 'yellow' : 'white'} anchorX="center" anchorY="middle">
            {client}
         </Text>
         <group ref={group} dispose={null}>
            <group name="Scene" scale={1.6} ref={avatarRef}>
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

useGLTF.preload('../Models/Player/FullMushy.gltf')

function usePrevious(value) {
   const ref = useRef('Idle')

   useEffect(() => {
      ref.current = value
   }, [value])

   return ref.current
}
