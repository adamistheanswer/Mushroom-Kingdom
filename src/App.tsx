import React, { useState, useEffect } from 'react'
import { Canvas, extend } from '@react-three/fiber'
import { Stats } from '@react-three/drei'
import { io, Socket } from 'socket.io-client'
import UserWrapper from './UserWrapper'
import { AmbientLight, SpotLight, PointLight, GridHelper } from 'three'
import ControlsWrapper from './ControlsWrapper'

extend({
    AmbientLight,
    SpotLight,
    PointLight,
    GridHelper,
})

function App() {
    const [clientSocket, setSocketClient] = useState<Socket | null>(null)
    const [clients, setClients] = useState({})

    useEffect(() => {
        setSocketClient(io())

        return () => {
            if (clientSocket) clientSocket.disconnect()
        }
    }, [])

    useEffect(() => {
        if (clientSocket) {
            clientSocket.on('clientUpdates', (updatedClients) => {
                setClients(updatedClients)
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
