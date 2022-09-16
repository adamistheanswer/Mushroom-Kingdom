import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Canvas, extend } from '@react-three/fiber'
import { Stats } from '@react-three/drei'
import { io, Socket } from 'socket.io-client'
import parser from 'socket.io-msgpack-parser'
import UserWrapper from './UserWrapper'

import {
    AmbientLight,
    SpotLight,
    PointLight,
    GridHelper,
    Mesh,
    BoxGeometry,
    Material,
} from 'three'
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

    const boxGemo = useMemo(() => new BoxGeometry(1, 1, 1), [])
    const remoteColliders = useRef<any>([])

    useEffect(() => {
        setSocketClient(io({ parser }))

        return () => {
            if (clientSocket) clientSocket.disconnect()
        }
    }, [])

    useEffect(() => {
        if (clientSocket) {
            let cols: Mesh<BoxGeometry, Material | Material[]>[] = []
            Object.keys(clients)
                .filter((clientKey) => clientKey !== clientSocket.id)
                .map((client) => {
                    const { p, r } = clients[client]

                    let player = new Mesh(boxGemo)
                    player.position.set(p[0], p[1], p[2])
                    player.rotation.set(0, r, 0, 'XYZ')
                    player.updateMatrixWorld(true)
                    cols.push(player)
                })
            remoteColliders.current = cols
        }
    }, [clients])

    useEffect(() => {
        if (clientSocket) {
            clientSocket.on('clientUpdates', (updatedClients) => {
                setClients(updatedClients)
            })
        }
    }, [clients])

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
                <ControlsWrapper
                    clientSocket={clientSocket}
                    remoteColliders={remoteColliders}
                />
                {Object.keys(clients)
                    .filter((clientKey) => clientKey !== clientSocket.id)
                    .map((client) => {
                        const { p, r } = clients[client]
                        return (
                            <UserWrapper
                                key={client}
                                id={client}
                                position={p}
                                rotation={r}
                            />
                        )
                    })}
            </Canvas>
        )
    )
}

export default App
