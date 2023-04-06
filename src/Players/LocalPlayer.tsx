import React, { useRef, useCallback, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Vector3, Euler, Group } from 'three'
import { useMediaQuery } from 'react-responsive'
import { AvatarAnimated } from './AvatarAnimated2'
import { useKeyboardControls } from '../Utils/useKeyboardControls'
import { useJoystickControls } from '../Utils/useJoystickControls'
import { playerActionsToIndexes } from '../Utils/playerActionsToIndexes'
import { OrbitControls } from '@react-three/drei'

function arrIdentical(a1, a2) {
   let i = a1.length
   if (i != a2.length) return false
   while (i--) {
      if (a1[i] !== a2[i]) return false
   }
   return true
}

const LocalPlayerWrapper = ({ clientSocket }) => {
   const orbitRef = useRef<OrbitControlsImpl>(null)
   const camRef = useRef<any>()
   const groupRef = useRef<Group>(null!)
   const velocity = 0.7

   const lastHeading = useRef(0)
   const lastAction = useRef('3')
   const lastPosition = useRef([0, 0, 0])

   const tempVector = useMemo(() => new Vector3(), [])
   const cameraOffset = useMemo(() => new Vector3(), [])
   const tempEuler = useMemo(() => new Euler(), [])
   const upVector = useMemo(() => new Vector3(0, 1, 0), [])

   const isTabletOrMobile = useMediaQuery({ query: '(max-width: 1224px)' })
   const joystickControls = useJoystickControls(isTabletOrMobile)
   const keyboardControls = useKeyboardControls()

   const updatePlayer = useCallback(
      (state) => {
         const group = groupRef.current

         const { forwardJoy, backwardJoy, leftJoy, rightJoy } = joystickControls.current
         const { forward, backward, left, right, dance1, dance2, excited, punch, salute, wave } =
            keyboardControls.current

         if (group && state.controls && state.camera) {
            const azimuthAngle = Number(state.controls.getAzimuthalAngle().toFixed(2))
            let actionsArray: string[] = []
            if (forward || forwardJoy !== 0) {
               tempVector.set(0, 0, forwardJoy !== 0 ? -forwardJoy : -1).applyAxisAngle(upVector, azimuthAngle)

               actionsArray.push('Walking')
               group.position.addScaledVector(tempVector, velocity)
            }

            if (backward || backwardJoy !== 0) {
               tempVector.set(0, 0, backwardJoy !== 0 ? backwardJoy : 1).applyAxisAngle(upVector, azimuthAngle)

               actionsArray.push('WalkingB')
               group.position.addScaledVector(tempVector, velocity)
            }

            if (left || leftJoy !== 0) {
               tempVector.set(leftJoy !== 0 ? -leftJoy : -1, 0, 0).applyAxisAngle(upVector, azimuthAngle)

               group.position.addScaledVector(tempVector, velocity)
               if (backward || backwardJoy !== 0) {
                  actionsArray.push('StrafeRight')
               } else {
                  actionsArray.push('StrafeLeft')
               }
            }

            if (right || rightJoy !== 0) {
               tempVector.set(rightJoy !== 0 ? rightJoy : 1, 0, 0).applyAxisAngle(upVector, azimuthAngle)
               group.position.addScaledVector(tempVector, velocity)
               if (backward || backwardJoy !== 0) {
                  actionsArray.push('StrafeLeft')
               } else {
                  actionsArray.push('StrafeRight')
               }
            }

            state.camera.position.sub(state.controls.target)
            cameraOffset.set(group.position.x, group.position.y + 7, group.position.z)
            state.controls.target.copy(cameraOffset)
            state.camera.position.add(cameraOffset)
            group.setRotationFromEuler(tempEuler.set(0, azimuthAngle, 0, 'XYZ'))

            let meshPositionArr = group.position.toArray()
            meshPositionArr[0] = Number(meshPositionArr[0].toFixed(2))
            meshPositionArr[1] = 0
            meshPositionArr[2] = Number(meshPositionArr[2].toFixed(2))

            if (dance1) actionsArray.push('Dance')
            if (dance2) actionsArray.push('Dance2')
            if (excited) actionsArray.push('Excited')
            if (punch) actionsArray.push('Punch')
            if (salute) actionsArray.push('Salute')
            if (wave) actionsArray.push('Waving')

            let isPlayerStationary = arrIdentical(lastPosition.current, meshPositionArr)
            let isPlayerRotationChanged = lastHeading.current !== azimuthAngle

            if (
               !isPlayerRotationChanged &&
               isPlayerStationary &&
               !dance1 &&
               !dance2 &&
               !excited &&
               !punch &&
               !salute &&
               !wave
            ) {
               actionsArray.push('Idle')
            }

            let actionsArrayString = actionsArray.toString()

            const noChange = !isPlayerRotationChanged && isPlayerStationary && lastAction.current === actionsArrayString

            if (isPlayerRotationChanged) lastHeading.current = azimuthAngle

            if (lastAction.current !== actionsArrayString) lastAction.current = actionsArrayString

            if (!isPlayerStationary) lastPosition.current = meshPositionArr

            !noChange &&
               clientSocket.send(
                  JSON.stringify({
                     type: 'move',
                     payload: {
                        rotation: groupRef.current?.rotation.toArray().slice(0, -1),
                        position: groupRef.current?.position,
                        action: actionsArray.length ? playerActionsToIndexes(actionsArray).join() : '3',
                     },
                  })
               )
         }
      },
      [groupRef, orbitRef, camRef, velocity, clientSocket]
   )

   useFrame((state) => {
      updatePlayer(state)
   })

   return (
      <group ref={groupRef}>
         <AvatarAnimated position={groupRef.current?.position} rotation={groupRef.current?.rotation}  />
         <OrbitControls
            ref={orbitRef}
            target={groupRef.current?.position}
            autoRotate={false}
            enableDamping={true}
            dampingFactor={0.1}
            enableZoom={false}
            enablePan={false}
            rotateSpeed={0.4}
            maxPolarAngle={Math.PI / 2}
            makeDefault
         />
      </group>
   )
}

export default LocalPlayerWrapper
