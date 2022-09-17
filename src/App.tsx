import React, { useState, useEffect, Suspense, useRef } from 'react'
import { Canvas, extend } from '@react-three/fiber'
import { Stats } from '@react-three/drei'
import { io, Socket } from 'socket.io-client'
import parser from 'socket.io-msgpack-parser'
import Lighting from './Environment/Lighting'
import Ground from './Environment/Ground'
import Forest from './Environment/Forest'
import Loader from './Components/Loader'
import AllPlayersWrapper from './Players/AllPlayersWrapper'

import { Color, Fog } from 'three'
extend({ Color, Fog })

const App: React.FC = () => {
   const [clientSocket, setSocketClient] = useState<Socket | null>(null)
   const largeScenery = useRef([])
   const smallScenery = useRef([])

   useEffect(() => {
      setSocketClient(io({ parser }))

      return () => {
         if (clientSocket) clientSocket.disconnect()
      }
   }, [])

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

   return (
      clientSocket && (
         <div style={{ width: '100%', height: '100vh' }}>
            <Canvas shadows>
               <Stats />
               <color attach="background" args={['#444444']} />
               <fog attach="fog" color="#444444" near={50} far={300} />
               <Lighting />
               <Suspense fallback={<Loader />}>
                  <AllPlayersWrapper clientSocket={clientSocket} />
                  <Ground />
                  <Forest
                     largeScenery={largeScenery}
                     smallScenery={smallScenery}
                  />
               </Suspense>
            </Canvas>
         </div>
      )
   )
}

export default App
