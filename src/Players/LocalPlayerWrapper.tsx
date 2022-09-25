import React, { useRef, useCallback, useMemo, useState } from 'react'
import { Text } from '@react-three/drei'
import { useFrame, extend, useThree } from '@react-three/fiber'
import { Vector3, Euler, Group } from 'three'
import { useMediaQuery } from 'react-responsive'
import { BoxGeometry, MeshNormalMaterial, Raycaster } from 'three'
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

const useDirectionalRaycast = (obj, direction) => {
   const raycaster = useMemo(() => new Raycaster(), [])
   const upVector = useMemo(() => new Vector3(0, 1, 0), [])
   const tempVector = useMemo(() => new Vector3(), [])
   const state = useThree((state) => state)

   let dirFB = 0
   let dirLR = 0

   if (direction.current === 'forward') dirFB = -1
   if (direction.current === 'backward') dirFB = 1
   if (direction.current === 'left') dirLR = -1
   if (direction.current === 'right') dirLR = 1

   let players = []

   state.scene.children.forEach((child) => {
      if (child.name === 'playerHitbox') {
         players.push(child)
      }
   })

   return () => {
      if (!obj.current) return []
      if (players.length === 0) return []
      if (!state.controls) return []

      const azimuthAngle = Number(state.controls.getAzimuthalAngle())

      tempVector.set(dirLR, 0, dirFB).applyAxisAngle(upVector, azimuthAngle)

      raycaster.set(obj.current.position.clone(), tempVector)
      return raycaster.intersectObjects(players)
   }
}

function checkPlayerBlocked(intersections) {
   let blocked = false

   let distances = intersections.map((player) => player.distance)

   distances.forEach((distance) => {
      if (distance < 5) {
         blocked = true
      }
   })

   return blocked
}

const LocalPlayerWrapper = ({ clientSocket }) => {
   const meshRef = useRef<Group>(null)
   const velocity = 0.6

   const lastHeading = useRef(0)
   const direction = useRef('')
   const lastAction = useRef('Idle')
   const lastPosition = useRef([0, 0, 0])

   const tempVector = useMemo(() => new Vector3(), [])
   const cameraOffset = useMemo(() => new Vector3(), [])
   const tempEuler = useMemo(() => new Euler(), [])
   const upVector = useMemo(() => new Vector3(0, 1, 0), [])

   const isTabletOrMobile = useMediaQuery({ query: '(max-width: 1224px)' })
   const joystickControls = useJoystickControls(isTabletOrMobile)
   const keyboardControls = useKeyboardControls()

   const [actions, setActions] = useState<string[]>([])

   const updatePlayer = useCallback(
      (state, intersections) => {
         const mesh = meshRef.current

         const { forwardJoy, backwardJoy, leftJoy, rightJoy } = joystickControls.current
         const { forward, backward, left, right, dance1, dance2, excited, punch, salute, wave } =
            keyboardControls.current

         if (mesh && state.controls && state.camera) {
            const azimuthAngle = Number(state.controls.getAzimuthalAngle().toFixed(2))

            let actionsArray: string[] = []

            if (forward || forwardJoy !== 0) {
               direction.current = 'forward'
               tempVector.set(0, 0, forwardJoy !== 0 ? -forwardJoy : -1).applyAxisAngle(upVector, azimuthAngle)

               if (!checkPlayerBlocked(intersections)) {
                  mesh.position.addScaledVector(tempVector, velocity)
                  actionsArray.push('Walking')
               }
            }

            if (backward || backwardJoy !== 0) {
               direction.current = 'backward'
               tempVector.set(0, 0, backwardJoy !== 0 ? backwardJoy : 0.7).applyAxisAngle(upVector, azimuthAngle)

               if (!checkPlayerBlocked(intersections)) {
                  mesh.position.addScaledVector(tempVector, velocity)
                  actionsArray.push('WalkingB')
               }
            }

            if (left || leftJoy !== 0) {
               direction.current = 'left'
               tempVector.set(leftJoy !== 0 ? -leftJoy : -0.7, 0, 0).applyAxisAngle(upVector, azimuthAngle)

               if (!checkPlayerBlocked(intersections)) {
                  mesh.position.addScaledVector(tempVector, velocity)
                  if (backward || backwardJoy !== 0) {
                     actionsArray.push('StrafeRight')
                  } else {
                     actionsArray.push('StrafeLeft')
                  }
               }
            }

            if (right || rightJoy !== 0) {
               direction.current = 'right'
               tempVector.set(rightJoy !== 0 ? rightJoy : 0.7, 0, 0).applyAxisAngle(upVector, azimuthAngle)

               if (!checkPlayerBlocked(intersections)) {
                  mesh.position.addScaledVector(tempVector, velocity)
                  if (backward || backwardJoy !== 0) {
                     actionsArray.push('StrafeLeft')
                  } else {
                     actionsArray.push('StrafeRight')
                  }
               }
            }

            state.camera.position.sub(state.controls.target)
            cameraOffset.set(mesh.position.x, mesh.position.y + 7, mesh.position.z)
            state.controls.target.copy(cameraOffset)
            state.camera.position.add(cameraOffset)
            mesh.setRotationFromEuler(tempEuler.set(0, azimuthAngle, 0, 'XYZ'))

            let meshPositionArr = mesh.position.toArray()
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

            setActions(actionsArray)

            let actionsArrayString = actionsArray.toString()

            const noChange = !isPlayerRotationChanged && isPlayerStationary && lastAction.current === actionsArrayString

            if (isPlayerRotationChanged) lastHeading.current = azimuthAngle

            if (lastAction.current !== actionsArrayString) lastAction.current = actionsArrayString

            if (!isPlayerStationary) lastPosition.current = meshPositionArr

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

   const raycast = useDirectionalRaycast(meshRef, direction)

   useFrame((state) => {
      const intersections = raycast()
      updatePlayer(state, intersections)
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
