import React, { useRef, useEffect, useCallback, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Vector3, Euler, Group } from 'three'
import { useMediaQuery } from 'react-responsive'
import { Avatar } from './Avatar'
import { useKeyboardControls } from '../Utils/useKeyboardControls'
import { useJoystickControls } from '../Utils/useJoystickControls'
import { playerActionsToIndexes } from '../Utils/playerActionsToIndexes'
import { OrbitControls } from '@react-three/drei'
import useUserStore from '../State/userStore'
import { NamePlate } from './NamePlate'
import throttle from 'lodash/throttle'
import { encode } from '@msgpack/msgpack'
import { useIsTyping } from '../Utils/useIsTyping'
import { usePlayerPositionsStore } from '../State/playerPositionsStore'
import { isColliding } from '../Utils/isColliding'

function arraysEqual(a: any[], b: any[]): boolean {
   if (a.length !== b.length) return false
   for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
   }
   return true
}

const LocalPlayerWrapper = ({ clientSocket }) => {
   const localClientId = useUserStore((state) => state.localClientId)
   const arraysEqualMemo = useMemo(() => arraysEqual, [])
   const playerPositions = useRef(usePlayerPositionsStore.getState().playerPositions)

   useEffect(() => usePlayerPositionsStore.subscribe((state) => (playerPositions.current = state.playerPositions)), [])

   const lastSentState = useRef<{ rotation: number[]; position: number[]; action: string } | null>(null)

   const orbitRef = useRef<OrbitControlsImpl>(null)
   const camRef = useRef<any>()
   const groupRef = useRef<Group>(null!)
   const velocity = 25

   const tempVector = useMemo(() => new Vector3(), [])
   const cameraOffset = useMemo(() => new Vector3(), [])
   const tempEuler = useMemo(() => new Euler(), [])
   const upVector = useMemo(() => new Vector3(0, 1, 0), [])

   const isTabletOrMobile = useMediaQuery({ query: '(max-width: 1224px)' })
   const joystickControls = useJoystickControls(isTabletOrMobile)

   const disableControls = useIsTyping()

   const keyboardControls = useKeyboardControls()

   const sendClientUpdate = useCallback(
      throttle((data) => {
         clientSocket.send(encode(data))
      }, 30),
      [clientSocket]
   )

   const updatePlayer = useCallback(
      (state, delta) => {
         const group = groupRef.current
         const isTyping = disableControls.current
         const { forwardJoy, backwardJoy, leftJoy, rightJoy } = joystickControls.current
         const { forward, backward, left, right, dance1, dance2, excited, punch, salute, wave } =
            keyboardControls.current

         if (group && state.controls && state.camera) {
            const azimuthAngle = Number(state.controls.getAzimuthalAngle().toFixed(2))
            let actionsArray: string[] = []
            if ((!isTyping && forward) || forwardJoy !== 0) {
               tempVector.set(0, 0, forwardJoy !== 0 ? -forwardJoy : -1).applyAxisAngle(upVector, azimuthAngle)
               const newPosition = group.position.clone().addScaledVector(tempVector, velocity * delta)
               if (!isColliding(newPosition, playerPositions.current, tempVector, 5)) {
                  group.position.copy(newPosition)
               }
               actionsArray.push('Walking')
            }

            if ((!isTyping && backward) || backwardJoy !== 0) {
               tempVector.set(0, 0, backwardJoy !== 0 ? backwardJoy : 1).applyAxisAngle(upVector, azimuthAngle)
               const newPosition = group.position.clone().addScaledVector(tempVector, velocity * delta)
               if (!isColliding(newPosition, playerPositions.current, tempVector, 5)) {
                  group.position.copy(newPosition)
               }
               actionsArray.push('WalkingB')
            }

            if ((!isTyping && left) || leftJoy !== 0) {
               tempVector.set(leftJoy !== 0 ? -leftJoy : -1, 0, 0).applyAxisAngle(upVector, azimuthAngle)
               const newPosition = group.position.clone().addScaledVector(tempVector, velocity * delta)
               if (!isColliding(newPosition, playerPositions.current, tempVector, 5)) {
                  group.position.copy(newPosition)
               }
               if ((!isTyping && backward) || backwardJoy !== 0) {
                  actionsArray.push('StrafeRight')
               } else {
                  actionsArray.push('StrafeLeft')
               }
            }

            if ((!isTyping && right) || rightJoy !== 0) {
               tempVector.set(rightJoy !== 0 ? rightJoy : 1, 0, 0).applyAxisAngle(upVector, azimuthAngle)
               const newPosition = group.position.clone().addScaledVector(tempVector, velocity * delta)
               if (!isColliding(newPosition, playerPositions.current, tempVector, 5)) {
                  group.position.copy(newPosition)
               }
               if ((!isTyping && backward) || backwardJoy !== 0) {
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

            if (dance1) actionsArray.push('Dance')
            if (dance2) actionsArray.push('Dance2')
            if (excited) actionsArray.push('Excited')
            if (punch) actionsArray.push('Punch')
            if (salute) actionsArray.push('Salute')
            if (wave) actionsArray.push('Waving')

            if (!dance1 && !dance2 && !excited && !punch && !salute && !wave) {
               actionsArray.push('Idle')
            }

            const currentRotation = groupRef.current?.rotation
               .toArray()
               .slice(0, -1)
               .map((value) => Number((value as number).toFixed(2)))

            const currentPosition = groupRef.current?.position
               .toArray()
               .map((value) => Number((value as number).toFixed(2)))

            const currentAction = isTyping
               ? '3'
               : actionsArray.length
               ? playerActionsToIndexes(actionsArray).join()
               : '3'

            const currentState = {
               rotation: currentRotation,
               position: currentPosition,
               action: currentAction,
            }

            if (
               !lastSentState.current ||
               !arraysEqualMemo(currentState.rotation, lastSentState.current.rotation) ||
               !arraysEqualMemo(currentState.position, lastSentState.current.position) ||
               currentAction !== lastSentState.current.action
            ) {
               sendClientUpdate({
                  type: 'move',
                  payload: {
                     rotation: currentState.rotation,
                     position: currentState.position,
                     action: currentState.action,
                  },
               })
               lastSentState.current = currentState
            }
         }
      },
      [groupRef, orbitRef, camRef, velocity, clientSocket]
   )

   useFrame((state, delta) => {
      updatePlayer(state, delta)
   })

   return (
      <group ref={groupRef}>
         <NamePlate
            key={localClientId}
            position={groupRef.current?.position}
            clientId={localClientId}
            isLocal={true}
            socket={clientSocket}
         />
         <Avatar
            position={groupRef.current?.position}
            rotation={groupRef.current?.rotation}
            clientId={localClientId}
            clientSocket={clientSocket}
         />
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
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
         />
      </group>
   )
}

export default LocalPlayerWrapper
