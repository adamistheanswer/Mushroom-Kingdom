import React, { useState, useEffect, Suspense, useRef } from 'react'
import { Canvas, extend } from '@react-three/fiber'
import { Stats, Loader } from '@react-three/drei'
import { io, Socket } from 'socket.io-client'
import parser from 'socket.io-msgpack-parser'
import AllPlayersWrapper from './Players/AllPlayersWrapper'
import Ground from './Environment/Ground'

import {
   AmbientLight,
   DirectionalLight,
   HemisphereLight,
   Color,
   Fog,
} from 'three'
import Forest from './Environment/Forest'

extend({
   Fog,
   Color,
   AmbientLight,
   DirectionalLight,
   HemisphereLight,
})

const App: React.FC = () => {
   const [clientSocket, setSocketClient] = useState<Socket | null>(null)
   const forestObjects = useRef([])

   useEffect(() => {
      setSocketClient(io({ parser }))

      return () => {
         if (clientSocket) clientSocket.disconnect()
      }
   }, [])

   useEffect(() => {
      if (clientSocket) {
         clientSocket.on('objects', (objects) => {
            console.log(objects)
            forestObjects.current = objects
         })
      }
   }, [clientSocket])

   return (
      clientSocket && (
         <>
            <Canvas shadows camera={{ position: [0, 4, 4] }}>
               <Stats />
               <color attach="background" args={['#444444']} />
               <fog attach="fog" color="#444444" near={50} far={300} />
               <hemisphereLight
                  args={[0xffffff, 0xfffffff, 0.6]}
                  color={[0.6, 1, 0.6]}
                  groundColor={[0.095, 1, 0.75]}
               />
               <directionalLight
                  args={[0xffffff, 0.5]}
                  position={[-100, 100, 100]}
                  position-target={[0, 0, 0]}
                  shadow-bias={-0.001}
                  shadow-mapSize-width={2048}
                  shadow-mapSize-height={2048}
                  shadow-camera-near={0.1}
                  shadow-camera-far={500}
                  shadow-camera-left={100}
                  shadow-camera-right={-100}
                  shadow-camera-top={100}
                  shadow-camera-bottom={-100}
                  castShadow
               />
               <ambientLight intensity={0.1} />
               <Suspense fallback={null}>
                  <AllPlayersWrapper clientSocket={clientSocket} />
                  <Ground />
                  <Forest objectPositions={forestObjects} />
               </Suspense>
            </Canvas>
            <Loader
               dataInterpolation={(p) => `Loading ${p.toFixed(2)}%`}
               initialState={(active) => active}
            />
         </>
      )
   )
}

export default App
