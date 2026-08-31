import React, { useRef, useEffect, useCallback, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Vector3, Euler, Group } from 'three'
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
import useClientAudioStore from '../State/clientsAudioStore'
import usePlayerActionStore from '../State/playerActionStore'

const LOCAL_CHILD_POSITION = new Vector3(0, 0, 0)
const LOCAL_CHILD_ROTATION = new Euler(0, 0, 0)

function arraysEqual(a: any[], b: any[]): boolean {
   if (a.length !== b.length) return false
   for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
   }
   return true
}

const LocalPlayerWrapper = ({ clientSocket }) => {
   const localClientId = useUserStore((state) => state.localClientId)
   const localVoiceState = useClientAudioStore((state) =>
      localClientId ? state.clients[localClientId] : { microphone: false, speaking: false }
   )
   const selectedMenuAction = usePlayerActionStore((state) => state.selectedMenuAction)
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

   const joystickControls = useJoystickControls()

   const disableControls = useIsTyping()

   const keyboardControls = useKeyboardControls()

   const sendClientUpdate = useMemo(
      () =>
         throttle((currentState) => {
            if (clientSocket.readyState !== WebSocket.OPEN || clientSocket.bufferedAmount > 128 * 1024) {
               return
            }

            clientSocket.send(
               encode({
                  type: 'move',
                  payload: {
                     rotation: currentState.rotation,
                     position: currentState.position,
                     action: currentState.action,
                  },
               })
            )
            lastSentState.current = currentState
         }, 30),
      [clientSocket]
   )

   useEffect(() => {
      return () => {
         sendClientUpdate.cancel()
      }
   }, [sendClientUpdate])

   const updatePlayer = useCallback(
      (state, delta) => {
         const group = groupRef.current
         const isTyping = disableControls.current
         const { forwardJoy, backwardJoy, leftJoy, rightJoy } = joystickControls.current
         const { forward, backward, left, right, dance1, dance2, excited, punch, salute, wave } =
            keyboardControls.current

         if (group && state.controls && state.camera) {
            const azimuthAngle = state.controls.getAzimuthalAngle()
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

            const currentRotation = [0, Number(azimuthAngle.toFixed(4)), 0]

            const currentPosition = groupRef.current?.position
               .toArray()
               .map((value) => Number((value as number).toFixed(2)))

            const currentAction = isTyping
               ? '3'
               : selectedMenuAction
                 ? selectedMenuAction
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
               sendClientUpdate(currentState)
            }
         }
      },
      [groupRef, orbitRef, camRef, velocity, clientSocket, selectedMenuAction, sendClientUpdate]
   )

   useFrame((state, delta) => {
      updatePlayer(state, delta)
   })

   return (
      <group ref={groupRef}>
         <NamePlate
            key={localClientId}
            position={LOCAL_CHILD_POSITION}
            clientId={localClientId}
            isLocal={true}
            socket={clientSocket}
            microphone={localVoiceState?.microphone}
            speaking={localVoiceState?.speaking}
         />
         <Avatar
            position={LOCAL_CHILD_POSITION}
            rotation={LOCAL_CHILD_ROTATION}
            clientId={localClientId}
            clientSocket={clientSocket}
         />
         <OrbitControls
            ref={orbitRef}
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
