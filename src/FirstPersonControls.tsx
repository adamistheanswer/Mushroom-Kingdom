// @ts-nocheck
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame,} from '@react-three/fiber'
import React, { useCallback, useEffect, useRef } from 'react'
import { Vector3 } from 'three'
// import nipplejs from 'nipplejs'

let fwdValue = 0
let bkdValue = 0
let rgtValue = 0
let lftValue = 0
// let joyManager: any
const tempVector = new Vector3()
const upVector = new Vector3(0, 1, 0)

// const NIPPLEJS_OPTIONS = {
//     zone: document.getElementById('joystickWrapper1'),
//     size: 120,
//     multitouch: true,
//     maxNumberOfNipples: 2,
//     mode: 'static',
//     restJoystick: true,
//     shape: 'circle',
//     position: { bottom: '60px', left: '60px' },
//     dynamicPage: true,
// }

const handleMove = (evt: Events, data: any) => {
    const forward = data.vector.y
    const turn = data.vector.x

    if (forward > 0) {
        fwdValue = Math.abs(forward)
        bkdValue = 0
    } else if (forward < 0) {
        fwdValue = 0
        bkdValue = Math.abs(forward)
    }

    if (turn > 0) {
        lftValue = 0
        rgtValue = Math.abs(turn)
    } else if (turn < 0) {
        lftValue = Math.abs(turn)
        rgtValue = 0
    }
}

type useKeyboardProps = {
    enableKeyboard: boolean
}

function useKeyboard({ enableKeyboard }: useKeyboardProps) {
    const onKeyDown = (event: KeyboardEvent) => {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                handleMove({}, { vector: { y: 1 } })
                break

            case 'ArrowLeft':
            case 'KeyA':
                handleMove({}, { vector: { x: -1 } })
                break

            case 'ArrowDown':
            case 'KeyS':
                handleMove({}, { vector: { y: -1 } })
                break

            case 'ArrowRight':
            case 'KeyD':
                handleMove({}, { vector: { x: 1 } })
                break
            default:
                break
        }
    }

    const onKeyUp = (event: KeyboardEvent) => {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                fwdValue = 0
                break

            case 'ArrowLeft':
            case 'KeyA':
                lftValue = 0
                break

            case 'ArrowDown':
            case 'KeyS':
                bkdValue = 0
                break

            case 'ArrowRight':
            case 'KeyD':
                rgtValue = 0
                break
            default:
                break
        }
    }

    useEffect(() => {
        if (enableKeyboard) {
            document.addEventListener('keydown', onKeyDown)
            document.addEventListener('keyup', onKeyUp)
        }

        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.removeEventListener('keyup', onKeyUp)
        }
    }, [enableKeyboard])
}

// type useJoystickProps = {
//     enableJoystick: boolean
// }

// function useJoystick({ enableJoystick }: useJoystickProps) {
//     const handleEnd = () => {
//         bkdValue = 0
//         fwdValue = 0
//         lftValue = 0
//         rgtValue = 0
//     }

//     useEffect(() => {
//         if (!joyManager && enableJoystick) {
//             //@ts-ignore
//             joyManager = nipplejs.create(NIPPLEJS_OPTIONS)
//             joyManager['0'].on('move', handleMove)
//             joyManager['0'].on('end', handleEnd)
//         }

//         return () => {
//             if (joyManager) {
//                 joyManager['0'].off('move', handleMove)
//                 joyManager['0'].off('end', handleEnd)
//             }
//         }
//     }, [enableJoystick])
// }

const FirstPersonControls = ({
    // enableJoystick = false,
    enableKeyboard = false,
    orbitProps = {},
    camProps = {},
    mult = 0.1,
}) => {
    const orbitRef = useRef()
    const camRef = useRef()
    const meshRef = useRef()


    const updatePlayer = useCallback(() => {
        const mesh = meshRef.current
        const controls = orbitRef.current
        const camera = camRef.current

        // move the player
        const angle = controls.getAzimuthalAngle()

        if (fwdValue > 0) {
            tempVector.set(0, 0, -fwdValue).applyAxisAngle(upVector, angle)
            mesh.position.addScaledVector(tempVector, mult)
        }

        if (bkdValue > 0) {
            tempVector.set(0, 0, bkdValue).applyAxisAngle(upVector, angle)
            mesh.position.addScaledVector(tempVector, mult)
        }

        if (lftValue > 0) {
            tempVector.set(-lftValue, 0, 0).applyAxisAngle(upVector, angle)
            mesh.position.addScaledVector(tempVector, mult)
        }

        if (rgtValue > 0) {
            tempVector.set(rgtValue, 0, 0).applyAxisAngle(upVector, angle)
            mesh.position.addScaledVector(tempVector, mult)
        }

        mesh.updateMatrixWorld()
        camera.position.sub(controls.target)
        controls.target.copy(mesh.position)
        camera.position.add(mesh.position)
    }, [meshRef, orbitRef, camRef, mult])

    useFrame(() => {
        updatePlayer()
    })

    // useJoystick({ enableJoystick })

    useKeyboard({ enableKeyboard })

    return (
        <>
            <PerspectiveCamera {...camProps} ref={camRef} />
            <OrbitControls
                autoRotate={false}
                enableDamping={false}
                enableZoom={false}
                enablePan={false}
                autoRotateSpeed={0}
                rotateSpeed={0.4}
                dampingFactor={0.1}
                {...orbitProps}
                ref={orbitRef}
            />
        </>
    )
}

export default FirstPersonControls
