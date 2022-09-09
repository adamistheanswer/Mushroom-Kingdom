import React, { useState, useEffect, useRef } from 'react'
import { Canvas, extend } from '@react-three/fiber'
import { OrbitControls, Stats } from '@react-three/drei'
import { io, Socket } from 'socket.io-client'
import UserWrapper from './UserWrapper'
// import FPSControls from './FirstPersonControls'
import { FPSControls } from "react-three-fpscontrols";
import { AmbientLight, SpotLight, PointLight, GridHelper } from 'three'

extend({
    AmbientLight,
    SpotLight,
    PointLight,
    GridHelper,
})

const ControlsWrapper = ({ clientSocket }) => {
    const controlsRef = useRef<any>()
    const [updateCallback, setUpdateCallback] = useState(null)


    console.log(controlsRef)
    // Register the update event and clean up
    useEffect(() => {
        const onControlsChange = (val) => {
            const { position, rotation } = val.target.object
            const { id } = clientSocket

            const posArray = []
            const rotArray = []

            position.toArray(posArray)
            rotation.toArray(rotArray)

            clientSocket.emit('positionUpdate', {
                id,
                rotation: rotArray,
                position: posArray,
            })
        }

        if (controlsRef.current) {
            setUpdateCallback(
                controlsRef.current.addEventListener('change', onControlsChange)
            )
        }

        // Dispose
        return () => {
            if (updateCallback && controlsRef.current)
                controlsRef.current.removeEventListener(
                    'change',
                    onControlsChange
                )
        }
    }, [controlsRef, clientSocket])

    return <OrbitControls ref={controlsRef} />
}

function App() {
    const [clientSocket, setSocketClient] = useState<Socket | null>(null)
    const [clients, setClients] = useState({})

    useEffect(() => {
        // On mount initialize the socket connection
        setSocketClient(io())

        // Dispose gracefuly
        return () => {
            if (clientSocket) clientSocket.disconnect()
        }
    }, [])

    useEffect(() => {
        if (clientSocket) {
            clientSocket.on('clientUpdates', (clients) => {
                setClients(clients)
            })
        }
    }, [clientSocket])

    return (
        clientSocket && (
            <Canvas camera={{ position: [0, 4, 4] }}>
                <Stats />
                <ambientLight intensity={0.5} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} />
                <pointLight position={[-10, -10, -10]} />
                <gridHelper position-y={-0.5} />
                <ControlsWrapper clientSocket={clientSocket} />
                {Object.keys(clients)
                    .filter((clientKey) => clientKey !== clientSocket.id)
                    .map((client) => {
                        const { position, rotation } = clients[client]
                        return (
                            <UserWrapper
                                key={client}
                                id={client}
                                position={position}
                                rotation={rotation}
                            />
                        )
                    })}
            </Canvas>
        )
    )
}

export default App
