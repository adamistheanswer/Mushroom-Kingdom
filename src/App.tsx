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

// const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
// const socket = new WebSocket(`${protocol}//${window.location.hostname}:8080`);

const protocol = window.location.protocol.includes('https') ? 'wss': 'ws'
const socket = new WebSocket(`${protocol}://${location.host}`);

socket.binaryType = 'arraybuffer'

interface WebSocketMessage {
   type: string;
   payload: any;
 }

const App: React.FC = () => {
   const [largeScenery, setLargeScenery] = useState([])
   const [smallScenery, setSmallScenery] = useState([])

   const setClientId = useUserStore((state) => state.setClientId)

   useEffect(() => {
      socket.addEventListener('message', (event) => {
         const message = decode(new Uint8Array(event.data)) as WebSocketMessage;

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
            <Stats />
            <PerspectiveCamera position={[25, 25, 25]} fov={70} makeDefault />

            <color attach="background" args={['black']} />
            <fog attach="fog" color="black" near={50} far={300} />
            <Lighting />
            <Suspense fallback={<Loader />}>
               <RemotePlayers clientSocket={socket} />
               <LocalPlayer clientSocket={socket} />
               <Ground />
               <Forest largeScenery={largeScenery} smallScenery={smallScenery} />
            </Suspense>
         </Canvas>
      </div>
   )
}

export default App
