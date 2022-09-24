import React, { useRef, useCallback, useMemo, useState } from 'react'
import { Text } from '@react-three/drei'
import { useFrame, extend } from '@react-three/fiber'
import { Mesh, Vector3, Euler, Group } from 'three'
import { useMediaQuery } from 'react-responsive'
import { BoxGeometry, MeshNormalMaterial } from 'three'
import { AvatarAnimated } from './AvatarAnimated'
import { useKeyboardControls } from '../Utils/useKeyboardControls'
import { useJoystickControls } from '../Utils/useJoystickControls'

extend({
   BoxGeometry,
   MeshNormalMaterial,
})

function playerActionsToIndexes(playerActions) {
   let indexArr = playerActions.map((action) => {
      switch (action) {
         case 'Dance':
            return 0
         case 'Dance2':
            return 1
         case 'Excited':
            return 2
         case 'Idle':
            return 3
         case 'Punch':
            return 4
         case 'Salute':
            return 5
         case 'StrafeLeft':
            return 6
         case 'StrafeRight':
            return 7
         case 'Walking':
            return 8
         case 'WalkingB':
            return 9
         case 'Waving':
            return 10
      }
   })

   return indexArr
}

function arrIdentical(a1, a2) {
   let i = a1.length
   if (i != a2.length) return false
   while (i--) {
      if (a1[i] !== a2[i]) return false
   }
   return true
}

const LocalPlayerWrapper = ({ clientSocket }) => {
   const meshRef = useRef<Group>(null)
   const velocity = 1

   const lastHeading = useRef(0)
   const lastAction = useRef('Idle')
   const lastPosition = useRef([0, 0, 0])

   const tempVector = useMemo(() => new Vector3(), [])
   const tempEuler = useMemo(() => new Euler(), [])
   const upVector = useMemo(() => new Vector3(0, 1, 0), [])

   const isTabletOrMobile = useMediaQuery({ query: '(max-width: 1224px)' })
   const joystickControls = useJoystickControls(isTabletOrMobile)
   const keyboardControls = useKeyboardControls()

   const [actions, setActions] = useState<string[]>([])

   const updatePlayer = useCallback(
      (state) => {
         const mesh = meshRef.current

         const { forward, backward, left, right, dance1, dance2, excited, punch, salute, wave } =
            keyboardControls.current
         const { forwardJoy, backwardJoy, leftJoy, rightJoy } = joystickControls.current

         if (mesh && state.controls && state.camera) {
            const azimuthAngle = Number(state.controls.getAzimuthalAngle().toFixed(2))

            let actionsArray: string[] = []

            if (forward || forwardJoy !== 0) {
               tempVector.set(0, 0, forwardJoy !== 0 ? -forwardJoy : -1).applyAxisAngle(upVector, azimuthAngle)

               actionsArray.push('Walking')
               mesh.position.addScaledVector(tempVector, velocity)
            }

            if (backward || backwardJoy !== 0) {
               tempVector.set(0, 0, backwardJoy !== 0 ? backwardJoy : 0.7).applyAxisAngle(upVector, azimuthAngle)

               actionsArray.push('WalkingB')
               mesh.position.addScaledVector(tempVector, velocity)
            }

            if (left || leftJoy !== 0) {
               tempVector.set(leftJoy !== 0 ? -leftJoy : -0.7, 0, 0).applyAxisAngle(upVector, azimuthAngle)

               if (backward || backwardJoy !== 0) {
                  actionsArray.push('StrafeRight')
               } else {
                  actionsArray.push('StrafeLeft')
               }

               mesh.position.addScaledVector(tempVector, velocity)
            }

            if (right || rightJoy !== 0) {
               tempVector.set(rightJoy !== 0 ? rightJoy : 0.7, 0, 0).applyAxisAngle(upVector, azimuthAngle)

               if (backward || backwardJoy !== 0) {
                  actionsArray.push('StrafeLeft')
               } else {
                  actionsArray.push('StrafeRight')
               }

               mesh.position.addScaledVector(tempVector, velocity)
            }

            state.camera.position.sub(state.controls.target)
            state.controls.target.copy(mesh.position)
            state.camera.position.add(mesh.position)
            mesh.setRotationFromEuler(tempEuler.set(0, azimuthAngle, 0, 'XYZ'))

            let meshPositionArr = mesh.position.toArray()
            meshPositionArr[0] = Number(meshPositionArr[0].toFixed(2))
            meshPositionArr[1] = 0
            meshPositionArr[2] = Number(meshPositionArr[2].toFixed(2))

            if (dance1) {
               actionsArray.push('Dance')
            }

            if (dance2) {
               actionsArray.push('Dance2')
            }

            if (excited) {
               actionsArray.push('Excited')
            }

            if (punch) {
               actionsArray.push('Punch')
            }

            if (salute) {
               actionsArray.push('Salute')
            }

            if (wave) {
               actionsArray.push('Waving')
            }

            setActions(actionsArray)

            if (
               lastHeading.current === azimuthAngle &&
               arrIdentical(lastPosition.current, meshPositionArr) &&
               !dance1 &&
               !dance2 &&
               !excited &&
               !punch &&
               !salute &&
               !wave
            ) {
               actionsArray.push('Idle')
            }

            const noChange =
               lastHeading.current === azimuthAngle &&
               arrIdentical(lastPosition.current, meshPositionArr) &&
               lastAction.current === actionsArray.toString()

            if (lastHeading.current !== azimuthAngle) {
               lastHeading.current = azimuthAngle
            }

            if (lastAction.current !== actionsArray.toString()) {
               lastAction.current = actionsArray.toString()
            }

            if (!arrIdentical(lastPosition.current, meshPositionArr)) {
               lastPosition.current = meshPositionArr
            }

            !noChange &&
               clientSocket.emit('move', {
                  r: azimuthAngle,
                  p: meshPositionArr,
                  s: playerActionsToIndexes(actionsArray),
               })
         }
      },
      [meshRef, velocity, clientSocket]
   )

   useFrame((state) => {
      updatePlayer(state)
   })

   return (
      <>
         <group ref={meshRef}>
            <Text
               rotation={[0, 0, 0]}
               position={[0, 13, 0]}
               fontSize={1}
               color="yellow"
               anchorX="center"
               anchorY="middle"
            >
               {clientSocket.id}
            </Text>
            <AvatarAnimated playerActions={actions.toString()} position={null} rotation={[0, Math.PI, 0]} />
         </group>
      </>
   )
}

export default LocalPlayerWrapper
