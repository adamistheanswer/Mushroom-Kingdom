import React, { useEffect, Suspense, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Stats } from '@react-three/drei'
import { io } from 'socket.io-client'
import parser from 'socket.io-msgpack-parser'
import Lighting from './Environment/Lighting'
import Ground from './Environment/Ground'
import Forest from './Environment/Forest'
import Loader from './Components/Loader'
import AllPlayersWrapper from './Players/AllPlayersWrapper'
import LocalPlayerWrapper from './Players/LocalPlayerWrapper'

// import { Color, Fog, BoxGeometry, Material, Mesh } from 'three'
// extend({ Color, Fog, BoxGeometry, Material, Mesh })

const clientSocket = io({ parser })

const App: React.FC = () => {
   const largeScenery = useRef([])
   const smallScenery = useRef([])

   useEffect(() => {
      if (clientSocket) {
         clientSocket.on('largeScenery', (objects) => {
            largeScenery.current = objects
         })

         clientSocket.on('smallScenery', (objects) => {
            smallScenery.current = objects
         })
      }
   }, [clientSocket])

   console.log('home')

   return (
      clientSocket && (
         <div style={{ width: '100%', height: '100vh' }}>
            <Canvas shadows>
               <Stats />
               <color attach="background" args={['black']} />
               <fog attach="fog" color="black" near={50} far={300} />
               <Lighting />
               <Suspense fallback={<Loader />}>
                  <AllPlayersWrapper clientSocket={clientSocket} />
                  <LocalPlayerWrapper clientSocket={clientSocket} />
                  <Ground />
                  <Forest largeScenery={largeScenery} smallScenery={smallScenery} />
               </Suspense>
            </Canvas>
         </div>
      )
   )
}

export default App
