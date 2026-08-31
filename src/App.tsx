import React, { useEffect, Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera, Stats } from '@react-three/drei'
import Lighting from './Environment/Lighting'
import Ground from './Environment/Ground'
import Forest from './Environment/Forest'
import Loader from './Components/Loader'
import RemotePlayers from './Players/RemotePlayers'
import LocalPlayer from './Players/LocalPlayer'
import useUserStore from './State/userStore'
import { decode, encode } from '@msgpack/msgpack'
import { PlayerAudioConnection } from './Components/PlayerAudioConnection'
import OverlayUIWrapper from './Components/OverlayUIWrapper'
import useSceneryStore from './State/SceneryStore'
import { PCFShadowMap } from 'three'
import { PlayerPositionUpdate, PlayerSnapshotData, usePlayerPositionsStore } from './State/playerPositionsStore'
import useClientAudioStore from './State/clientsAudioStore'
import { MobileJoystick } from './Utils/useJoystickControls'

function createSocket() {
   const protocol = window.location.protocol.includes('https') ? 'wss' : 'ws'
   const nextSocket = new WebSocket(`${protocol}://${location.host}`)
   nextSocket.binaryType = 'arraybuffer'
   return nextSocket
}

interface WebSocketMessage {
   type: string
   payload: any
}

const App: React.FC = () => {
   const [socket, setSocket] = useState<WebSocket | null>(null)
   const setClientId = useUserStore((state) => state.setClientId)
   const setLargeScenery = useSceneryStore((state) => state.setLargeScenery)
   const setSmallScenery = useSceneryStore((state) => state.setSmallScenery)
   const updatePlayerPositions = usePlayerPositionsStore((state) => state.updatePlayerPositions)
   const updatePlayerDeltas = usePlayerPositionsStore((state) => state.updatePlayerDeltas)
   const removeDisconnectedPlayer = usePlayerPositionsStore((state) => state.removeDisconnectedPlayer)
   const setAudioClients = useClientAudioStore((state) => state.setClients)
   const updateAudioClientsFromDeltas = useClientAudioStore((state) => state.updateClientsFromDeltas)
   const removeAudioClient = useClientAudioStore((state) => state.removeClient)

   useEffect(() => {
      let reconnectTimeout: number | undefined
      let heartbeatInterval: number | undefined
      let activeSocket: WebSocket | null = null
      let cleanupSocket: (() => void) | undefined
      let closingForUnmount = false
      let currentClientId = ''
      let pendingActiveClients: Record<string, PlayerSnapshotData> | null = null
      let pendingDeltas: PlayerPositionUpdate[] = []

      const clearHeartbeat = () => {
         if (heartbeatInterval) {
            window.clearInterval(heartbeatInterval)
            heartbeatInterval = undefined
         }
      }

      const sendHeartbeat = (nextSocket: WebSocket) => {
         if (nextSocket.readyState === WebSocket.OPEN && nextSocket.bufferedAmount < 64 * 1024) {
            nextSocket.send(encode({ type: 'heartbeat', payload: Date.now() }))
         }
      }

      const connect = () => {
         cleanupSocket?.()
         const nextSocket = createSocket()
         activeSocket = nextSocket
         setSocket(nextSocket)

         const handleOpen = () => {
            clearHeartbeat()
            sendHeartbeat(nextSocket)
            heartbeatInterval = window.setInterval(() => sendHeartbeat(nextSocket), 25000)
         }

         const handleMessage = (event) => {
            const message = decode(event.data) as WebSocketMessage

            if (message.type === 'largeScenery') {
               setLargeScenery(message.payload)
            }

            if (message.type === 'smallScenery') {
               setSmallScenery(message.payload)
            }

            if (message.type === 'clientId') {
               currentClientId = message.payload
               setClientId(currentClientId)

               if (pendingActiveClients) {
                  updatePlayerPositions(pendingActiveClients, currentClientId)
                  pendingActiveClients = null
               }

               if (pendingDeltas.length > 0) {
                  updatePlayerDeltas(pendingDeltas, currentClientId)
                  pendingDeltas = []
               }
            }

            if (message.type === 'activeClients') {
               setAudioClients(message.payload)

               if (currentClientId) {
                  updatePlayerPositions(message.payload, currentClientId)
               } else {
                  pendingActiveClients = message.payload
               }
            }

            if (message.type === 'clientUpdates') {
               if (Array.isArray(message.payload)) {
                  updateAudioClientsFromDeltas(message.payload)

                  if (currentClientId) {
                     updatePlayerDeltas(message.payload, currentClientId)
                  } else {
                     pendingDeltas.push(...message.payload)
                  }
               } else if (currentClientId) {
                  updatePlayerPositions(message.payload, currentClientId)
               } else {
                  pendingActiveClients = message.payload
               }
            }

            if (message.type === 'clientDisconnect') {
               removeDisconnectedPlayer(message.payload)
               removeAudioClient(message.payload)
            }
         }

         const handleClose = () => {
            clearHeartbeat()
            if (!closingForUnmount) {
               setSocket(null)
               setClientId('')
               reconnectTimeout = window.setTimeout(connect, 1000)
            }
         }

         const handleError = (event) => {
            console.error('WebSocket error:', event)
         }

         nextSocket.addEventListener('open', handleOpen)
         nextSocket.addEventListener('message', handleMessage)
         nextSocket.addEventListener('close', handleClose)
         nextSocket.addEventListener('error', handleError)

         cleanupSocket = () => {
            nextSocket.removeEventListener('open', handleOpen)
            nextSocket.removeEventListener('message', handleMessage)
            nextSocket.removeEventListener('close', handleClose)
            nextSocket.removeEventListener('error', handleError)
         }
      }

      connect()

      return () => {
         closingForUnmount = true
         clearHeartbeat()

         if (reconnectTimeout) {
            window.clearTimeout(reconnectTimeout)
         }

         cleanupSocket?.()

         if (activeSocket?.readyState === WebSocket.OPEN || activeSocket?.readyState === WebSocket.CONNECTING) {
            activeSocket.close()
         }
      }
   }, [
      removeAudioClient,
      removeDisconnectedPlayer,
      setAudioClients,
      setClientId,
      setLargeScenery,
      setSmallScenery,
      updateAudioClientsFromDeltas,
      updatePlayerDeltas,
      updatePlayerPositions,
   ])

   return (
      <div style={{ width: '100%', height: '100vh' }}>
         <Canvas shadows={{ type: PCFShadowMap }}>
            {/* <Stats /> */}
            <PerspectiveCamera position={[25, 25, 25]} fov={70} makeDefault />
            <color attach="background" args={['black']} />
            <fog attach="fog" color="black" near={50} far={300} />
            <Lighting />
            <Suspense fallback={<Loader />}>
               {socket && <RemotePlayers clientSocket={socket} />}
               {socket && <LocalPlayer clientSocket={socket} />}
               <Ground />
               <Forest />
            </Suspense>
         </Canvas>

         {socket && <OverlayUIWrapper socket={socket} />}
         {socket && <MobileJoystick />}
         {socket && <PlayerAudioConnection socket={socket} />}
      </div>
   )
}

export default App
