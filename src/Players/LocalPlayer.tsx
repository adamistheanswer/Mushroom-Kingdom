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

function arrIdentical(a1, a2) {
   let i = a1.length
   if (i != a2.length) return false
   while (i--) {
      if (a1[i] !== a2[i]) return false
   }
   return true
}

const LocalPlayerWrapper = ({ clientSocket }) => {
   const localClientId = useUserStore((state) => state.localClientId)

   const playerPositions = useRef(usePlayerPositionsStore.getState().playerPositions)

   useEffect(() => usePlayerPositionsStore.subscribe((state) => (playerPositions.current = state.playerPositions)), [])

   const orbitRef = useRef<OrbitControlsImpl>(null)
   const camRef = useRef<any>()
   const groupRef = useRef<Group>(null!)
   const playerAction = useRef('3')
   const velocity = 25

   const lastHeading = useRef(0)
   const lastAction = useRef('3')
   const lastPosition = useRef([0, 0, 0])

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
      }, 20),
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
               if (!isColliding(newPosition, playerPositions.current, 5)) {
                  group.position.copy(newPosition)
               }
               actionsArray.push('Walking')
            }

            if ((!isTyping && backward) || backwardJoy !== 0) {
               tempVector.set(0, 0, backwardJoy !== 0 ? backwardJoy : 1).applyAxisAngle(upVector, azimuthAngle)
               const newPosition = group.position.clone().addScaledVector(tempVector, velocity * delta)
               if (!isColliding(newPosition, playerPositions.current, 5)) {
                  group.position.copy(newPosition)
               }
               actionsArray.push('WalkingB')
            }

            if ((!isTyping && left) || leftJoy !== 0) {
               tempVector.set(leftJoy !== 0 ? -leftJoy : -1, 0, 0).applyAxisAngle(upVector, azimuthAngle)
               const newPosition = group.position.clone().addScaledVector(tempVector, velocity * delta)
               if (!isColliding(newPosition, playerPositions.current, 5)) {
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
               if (!isColliding(newPosition, playerPositions.current, 5)) {
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

            let meshPositionArr = group.position.toArray()
            meshPositionArr[0] = Math.round(meshPositionArr[0] * 100) / 100
            meshPositionArr[1] = 0
            meshPositionArr[2] = Math.round(meshPositionArr[2] * 100) / 100

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

            playerAction.current = actionsArray.length ? playerActionsToIndexes(actionsArray).join() : '3'

            !noChange &&
               sendClientUpdate({
                  type: 'state_set_client_move',
                  payload: {
                     rotation: groupRef.current?.rotation
                        .toArray()
                        .slice(0, -1)
                        .map((value) => Number((value as number).toFixed(2))),
                     position: groupRef.current?.position,
                     action: isTyping ? '3' : actionsArray.length ? playerActionsToIndexes(actionsArray).join() : '3',
                  },
               })
         }
      },
      [groupRef, orbitRef, camRef, velocity, playerAction, clientSocket]
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
