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
import { decode } from '@msgpack/msgpack'
import { PlayerAudioConnection } from './Components/PlayerAudioConnection'
import OverlayUIWrapper from './Components/OverlayUIWrapper'
import useSceneryStore from './State/SceneryStore'

const protocol = window.location.protocol.includes('https') ? 'wss' : 'ws'
const socket = new WebSocket(`${protocol}://${location.host}`)

socket.binaryType = 'arraybuffer'

interface WebSocketMessage {
   type: string
   payload: any
}

const App: React.FC = () => {
   const setClientId = useUserStore((state) => state.setClientId)
   const setLargeScenery = useSceneryStore((state) => state.setLargeScenery)
   const setSmallScenery = useSceneryStore((state) => state.setSmallScenery)

   useEffect(() => {
      socket.addEventListener('message', (event) => {
         const message = decode(event.data) as WebSocketMessage

         if (message.type === 'largeScenery') {
            setLargeScenery(message.payload)
         }

         if (message.type === 'smallScenery') {
            setSmallScenery(message.payload)
         }

         if (message.type === 'clientId') {
            setClientId(message.payload)
         }
      })

      socket.addEventListener('error', (event) => {
         console.error('WebSocket error:', event)
      })

      return () => {
         socket.close()
      }
   }, [])

   return (
      <div style={{ width: '100%', height: '100vh' }}>
         <Canvas shadows>
            {/* <Stats /> */}
            <PerspectiveCamera position={[25, 25, 25]} fov={70} makeDefault />
            <color attach="background" args={['black']} />
            <fog attach="fog" color="black" near={50} far={300} />
            <Lighting />
            <Suspense fallback={<Loader />}>
               <RemotePlayers clientSocket={socket} />
               <LocalPlayer clientSocket={socket} />
               <Ground />
               <Forest />
            </Suspense>
         </Canvas>

         <OverlayUIWrapper socket={socket} />
         <PlayerAudioConnection socket={socket} />
      </div>
   )
}

export default App
