import React, { useEffect, Suspense, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Stats } from '@react-three/drei'
import { io } from 'socket.io-client'
import parser from 'socket.io-msgpack-parser'
import Lighting from './Environment/Lighting'
import Ground from './Environment/Ground'
import Forest from './Environment/Forest'
import Loader from './Components/Loader'
import RemotePlayers from './Players/RemotePlayers'
import LocalPlayer from './Players/LocalPlayer'
import useUserStore from './State/userStore'

// const clientSocket = io({ parser })

const socket = new WebSocket('ws://localhost:8080')

const App: React.FC = () => {
   const [largeScenery, setLargeScenery] = useState([])
   const [smallScenery, setSmallScenery] = useState([])
   // const [clientId, setClientId] = useState(null)

   const setClientId = useUserStore((state) => state.setClientId)
   // const clientId = useUserStore((state) => state.clientId)
   // console.log(clientId)
   // console.log(clientId, largeScenery, smallScenery)

   // useEffect(() => {
   //    if (clientSocket) {
   //       clientSocket.on('largeScenery', (objects) => {
   //          largeScenery.current = objects
   //       })

   //       clientSocket.on('smallScenery', (objects) => {
   //          smallScenery.current = objects
   //       })
   //    }
   // }, [clientSocket])

   useEffect(() => {
      socket.addEventListener('message', (event) => {
         const message = JSON.parse(event.data)

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
