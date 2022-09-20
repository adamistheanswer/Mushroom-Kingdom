import React, { useRef, useCallback, useMemo, useState } from 'react'
import { OrbitControls, PerspectiveCamera, Text, Html } from '@react-three/drei'
import { useFrame, extend } from '@react-three/fiber'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
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

const LocalPlayerWrapper = ({ clientSocket }) => {
   const orbitRef = useRef<OrbitControlsImpl>(null)
   const camRef = useRef<any>()
   const meshRef = useRef<Mesh | Group>(null)
   const velocity = 1

   const lastHeading = useRef(0)
   const lastAction = useRef('Idle')
   const lastPosition = useRef([0, 0, 0])

   const tempVector = useMemo(() => new Vector3(), [])
   const upVector = useMemo(() => new Vector3(0, 1, 0), [])

   const isTabletOrMobile = useMediaQuery({ query: '(max-width: 1224px)' })
   const joystickControls = useJoystickControls(isTabletOrMobile)
   const keyboardControls = useKeyboardControls()

   const [action, setAction] = useState('Idle')

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
            setAction('Walking')
            mesh.position.addScaledVector(tempVector, velocity)
         }

         if (backward || backwardJoy !== 0) {
            tempVector.set(0, 0, backwardJoy !== 0 ? backwardJoy : 1).applyAxisAngle(upVector, azimuthAngle)
            setAction('WalkingB')
            mesh.position.addScaledVector(tempVector, velocity)
         }

         if (left || leftJoy !== 0) {
            tempVector.set(leftJoy !== 0 ? -leftJoy : -1, 0, 0).applyAxisAngle(upVector, azimuthAngle)

            setAction('StrafeLeft')
            mesh.position.addScaledVector(tempVector, velocity)
         }

         if (right || rightJoy !== 0) {
            tempVector.set(rightJoy !== 0 ? rightJoy : 1, 0, 0).applyAxisAngle(upVector, azimuthAngle)
            setAction('StrafeRight')
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
            setAction('Dance')
         }

         if (dance2) {
            setAction('Dance2')
         }

         if (excited) {
            setAction('Excited')
         }

         if (punch) {
            setAction('Punch')
         }

         if (salute) {
            setAction('Salute')
         }

         if (wave) {
            setAction('Waving')
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
            setAction('Idle')
         }

         const noChange =
            lastHeading.current === azimuthAngle &&
            arrIdentical(lastPosition.current, meshPositionArr) &&
            lastAction.current === action

         if (lastHeading.current !== azimuthAngle) {
            lastHeading.current = azimuthAngle
         }

         if (lastAction.current !== action) {
            lastAction.current = action
         }

         if (!arrIdentical(lastPosition.current, meshPositionArr)) {
            lastPosition.current = meshPositionArr
         }

         !noChange &&
            clientSocket.emit('move', {
               r: azimuthAngle,
               p: meshPositionArr,
               s: action,
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
            <AvatarAnimated action={action} position={null} rotation={[0, Math.PI, 0]} />
         </group>
      </>
   )
}

export default LocalPlayerWrapper
