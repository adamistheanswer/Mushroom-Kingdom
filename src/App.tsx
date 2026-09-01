import React, { useCallback, useEffect, Suspense, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera, Stats } from '@react-three/drei'
import Lighting from './Environment/Lighting'
import Ground from './Environment/Ground'
import Grass from './Environment/Grass'
import Forest from './Environment/Forest'
import BoundaryWalls from './Environment/BoundaryWalls'
import Sky from './Environment/Sky'
import Loader from './Components/Loader'
import RemotePlayers from './Players/RemotePlayers'
import LocalPlayer from './Players/LocalPlayer'
import useUserStore from './State/userStore'
import { decode, encode } from '@msgpack/msgpack'
import { PlayerAudioConnection } from './Components/PlayerAudioConnection'
import OverlayUIWrapper from './Components/OverlayUIWrapper'
import useSceneryStore from './State/SceneryStore'
import { PCFSoftShadowMap } from 'three'
import { PlayerPositionUpdate, PlayerSnapshotData, usePlayerPositionsStore } from './State/playerPositionsStore'
import useClientAudioStore from './State/clientsAudioStore'
import { MobileJoystick } from './Utils/useJoystickControls'
import { useChatStore } from './State/chatStore'
import { FOG_FAR, FOG_NEAR, SCENE_BACKGROUND_COLOR, SCENE_FOG_COLOR } from './Environment/sceneQuality'
import { ChatBubbleTicker } from './Players/NamePlate'
import DebugOverlay, {
   createNetworkDebugStats,
   createSceneDebugStats,
   getSocketPayloadByteLength,
   instrumentSocketSend,
   SceneDebugSampler,
} from './Components/DebugOverlay'

const canvasGlOptions = { powerPreference: 'high-performance' } as const
const DEBUG_TOOLS_ENABLED = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')

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

function SceneReadySignal({ onReady }: { onReady: () => void }) {
   useEffect(() => {
      const frameId = window.requestAnimationFrame(onReady)
      return () => window.cancelAnimationFrame(frameId)
   }, [onReady])

   return null
}

const App: React.FC = () => {
   const [socket, setSocket] = useState<WebSocket | null>(null)
   const [sceneReady, setSceneReady] = useState(false)
   const [localSpawnEffectReady, setLocalSpawnEffectReady] = useState(false)
   const networkDebugStatsRef = useRef(createNetworkDebugStats())
   const sceneDebugStatsRef = useRef(createSceneDebugStats())
   const setClientId = useUserStore((state) => state.setClientId)
   const setLargeScenery = useSceneryStore((state) => state.setLargeScenery)
   const setSmallScenery = useSceneryStore((state) => state.setSmallScenery)
   const updatePlayerPositions = usePlayerPositionsStore((state) => state.updatePlayerPositions)
   const updatePlayerDeltas = usePlayerPositionsStore((state) => state.updatePlayerDeltas)
   const removeDisconnectedPlayer = usePlayerPositionsStore((state) => state.removeDisconnectedPlayer)
   const setAudioClients = useClientAudioStore((state) => state.setClients)
   const updateAudioClientsFromDeltas = useClientAudioStore((state) => state.updateClientsFromDeltas)
   const removeAudioClient = useClientAudioStore((state) => state.removeClient)
   const setChatMessages = useChatStore((state) => state.setMessages)
   const addChatMessage = useChatStore((state) => state.addMessage)
   const markChatClientDisconnected = useChatStore((state) => state.markClientDisconnected)
   const clearChatMessages = useChatStore((state) => state.clearMessages)

   const handleSceneReady = useCallback(() => {
      setSceneReady(true)
   }, [])

   useEffect(() => {
      if (!socket || !sceneReady) {
         setLocalSpawnEffectReady(false)
         return
      }

      setLocalSpawnEffectReady(false)
      const frameId = window.requestAnimationFrame(() => setLocalSpawnEffectReady(true))
      return () => window.cancelAnimationFrame(frameId)
   }, [sceneReady, socket])

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
         const restoreInstrumentedSend = DEBUG_TOOLS_ENABLED
            ? instrumentSocketSend(nextSocket, networkDebugStatsRef)
            : undefined
         activeSocket = nextSocket
         setSocket(nextSocket)
         setLocalSpawnEffectReady(false)

         const handleOpen = () => {
            clearHeartbeat()
            if (DEBUG_TOOLS_ENABLED && nextSocket.readyState === WebSocket.OPEN) {
               nextSocket.send(encode({ type: 'debug_subscribe', payload: { enabled: true } }))
            }
            sendHeartbeat(nextSocket)
            heartbeatInterval = window.setInterval(() => sendHeartbeat(nextSocket), 25000)
         }

         const handleMessage = (event) => {
            if (DEBUG_TOOLS_ENABLED) {
               networkDebugStatsRef.current.incomingMessages += 1
               networkDebugStatsRef.current.incomingBytes += getSocketPayloadByteLength(event.data)
            }

            let message: WebSocketMessage

            try {
               message = decode(event.data) as WebSocketMessage
            } catch (error) {
               if (DEBUG_TOOLS_ENABLED) {
                  networkDebugStatsRef.current.decodeErrors += 1
               }
               console.error('Unable to decode WebSocket message:', error)
               return
            }

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
               markChatClientDisconnected(message.payload)
            }

            if (message.type === 'chatMessages') {
               setChatMessages(message.payload)
            }

            if (message.type === 'chatMessage') {
               addChatMessage(message.payload)
            }

            if (message.type === 'voiceChatStatusUpdate') {
               const { clientId, voiceChatEnabled } = message.payload
               updateAudioClientsFromDeltas([{ id: clientId, microphone: voiceChatEnabled }])
            }

            if (message.type === 'debugServerStats' && DEBUG_TOOLS_ENABLED) {
               networkDebugStatsRef.current.server = message.payload
            }
         }

         const handleClose = () => {
            clearHeartbeat()
            if (!closingForUnmount) {
               setSocket(null)
               setClientId('')
               setLocalSpawnEffectReady(false)
               clearChatMessages()
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
            restoreInstrumentedSend?.()
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
         clearChatMessages()

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
      setChatMessages,
      addChatMessage,
      markChatClientDisconnected,
      clearChatMessages,
   ])

   return (
      <div style={{ width: '100%', height: '100vh' }}>
         <Canvas dpr={[1, 1.5]} gl={canvasGlOptions} shadows={{ type: PCFSoftShadowMap }}>
             {/* <Stats />  */}
            {DEBUG_TOOLS_ENABLED && <SceneDebugSampler sceneStatsRef={sceneDebugStatsRef} />}
            <PerspectiveCamera position={[25, 25, 25]} fov={70} makeDefault />
            <color attach="background" args={[SCENE_BACKGROUND_COLOR]} />
            <fog attach="fog" color={SCENE_FOG_COLOR} near={FOG_NEAR} far={FOG_FAR} />
            <Lighting />
            <Sky />
            <Suspense fallback={<Loader />}>
               <SceneReadySignal onReady={handleSceneReady} />
               {socket && <RemotePlayers />}
               {socket && <LocalPlayer clientSocket={socket} showSpawnEffect={localSpawnEffectReady} />}
               <Ground />
               <Grass />
               <Forest />
               <BoundaryWalls />
            </Suspense>
         </Canvas>

         {socket && <OverlayUIWrapper socket={socket} />}
         {socket && <MobileJoystick />}
         {socket && <PlayerAudioConnection socket={socket} />}
         {socket && <ChatBubbleTicker />}
         {DEBUG_TOOLS_ENABLED && (
            <DebugOverlay socket={socket} networkStatsRef={networkDebugStatsRef} sceneStatsRef={sceneDebugStatsRef} />
         )}
      </div>
   )
}

export default App
