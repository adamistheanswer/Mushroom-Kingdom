import React, { useRef, useCallback, useMemo } from 'react'
import { OrbitControls, PerspectiveCamera, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Vector3, Euler, Group } from 'three'
import { useMediaQuery } from 'react-responsive'
import { AvatarAnimated } from './AvatarAnimated'
import { useKeyboardControls } from '../Utils/useKeyboardControls'
import { useJoystickControls } from '../Utils/useJoystickControls'

const LocalPlayerWrapper = ({ clientSocket }) => {
   const orbitRef = useRef<OrbitControlsImpl>(null)
   const camRef = useRef<any>()
   const meshRef = useRef<Group>(null)
   const velocity = 1

   const lastHeading = useRef(0)
   const lastAction = useRef('Idle')
   const action = useRef('Idle')
   const lastPosition = useRef([0, 0, 0])

   const tempVector = useMemo(() => new Vector3(), [])
   const upVector = useMemo(() => new Vector3(0, 1, 0), [])

   const isTabletOrMobile = useMediaQuery({ query: '(max-width: 1224px)' })
   const joystickControls = useJoystickControls(isTabletOrMobile)
   const keyboardControls = useKeyboardControls()

   const updatePlayer = useCallback(() => {
      const mesh = meshRef.current
      const orbitControls = orbitRef.current
      const camera = camRef.current

      const { forward, backward, left, right, dance1, dance2, excited, punch, salute, wave } = keyboardControls.current
      const { forwardJoy, backwardJoy, leftJoy, rightJoy } = joystickControls.current

      function arrIdentical(a1, a2) {
         let i = a1.length
         if (i != a2.length) return false
         while (i--) {
            if (a1[i] !== a2[i]) return false
         }
         return true
      }

      if (mesh && orbitControls && camera) {
         const azimuthAngle = Number(orbitControls.getAzimuthalAngle().toFixed(2))

         if (forward || forwardJoy !== 0) {
            tempVector.set(0, 0, forwardJoy !== 0 ? -forwardJoy : -1).applyAxisAngle(upVector, azimuthAngle)
            action.current = 'Walking'
            mesh.position.addScaledVector(tempVector, velocity)
         }

         if (backward || backwardJoy !== 0) {
            tempVector.set(0, 0, backwardJoy !== 0 ? backwardJoy : 1).applyAxisAngle(upVector, azimuthAngle)
            action.current = 'WalkingB'
            mesh.position.addScaledVector(tempVector, velocity)
         }

         if (left || leftJoy !== 0) {
            tempVector.set(leftJoy !== 0 ? -leftJoy : -1, 0, 0).applyAxisAngle(upVector, azimuthAngle)
            action.current = 'StrafeLeft'
            mesh.position.addScaledVector(tempVector, velocity)
         }

         if (right || rightJoy !== 0) {
            tempVector.set(rightJoy !== 0 ? rightJoy : 1, 0, 0).applyAxisAngle(upVector, azimuthAngle)
            action.current = 'StrafeRight'
            mesh.position.addScaledVector(tempVector, velocity)
         }

         camera.position.sub(orbitControls.target)
         orbitControls.target.copy(mesh.position)
         camera.position.add(mesh.position)
         mesh.setRotationFromEuler(new Euler(0, azimuthAngle, 0, 'XYZ'))

         let meshPositionArr = mesh.position.toArray()
         meshPositionArr[0] = Number(meshPositionArr[0].toFixed(2))
         meshPositionArr[1] = 0
         meshPositionArr[2] = Number(meshPositionArr[2].toFixed(2))

         if (dance1) {
            action.current = 'Dance'
         }

         if (dance2) {
            action.current = 'Dance2'
         }

         if (excited) {
            action.current = 'Excited'
         }

         if (punch) {
            action.current = 'Punch'
         }

         if (salute) {
            action.current = 'Salute'
         }

         if (wave) {
            action.current = 'Waving'
         }

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
            action.current = 'Idle'
         }

         const noChange =
            lastHeading.current === azimuthAngle &&
            arrIdentical(lastPosition.current, meshPositionArr) &&
            lastAction.current === action.current

         if (lastHeading.current !== azimuthAngle) {
            lastHeading.current = azimuthAngle
         }

         if (lastAction.current !== action.current) {
            lastAction.current = action.current
         }

         if (!arrIdentical(lastPosition.current, meshPositionArr)) {
            lastPosition.current = meshPositionArr
         }

         !noChange &&
            clientSocket.emit('move', {
               r: azimuthAngle,
               p: meshPositionArr,
               s: action.current,
            })
      }
   }, [meshRef, orbitRef, camRef, velocity, action, clientSocket])

   useFrame(() => {
      updatePlayer()
   })

   return (
      <>
         <PerspectiveCamera position={[25, 20, 40]} fov={70} ref={camRef} makeDefault />
         <OrbitControls
            autoRotate={false}
            enableDamping={false}
            enableZoom={false}
            enablePan={false}
            rotateSpeed={0.4}
            target={[0, 0, 0]}
            maxPolarAngle={Math.PI / 2 - 0.1}
            ref={orbitRef}
         />

         <group ref={meshRef}>
            <AvatarAnimated clientSocket={clientSocket} client={clientSocket.id} isLocal={true} />
         </group>
      </>
   )
}

export default LocalPlayerWrapper
