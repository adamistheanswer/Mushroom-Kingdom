import React, { useEffect, Suspense, useRef, useMemo } from 'react'
import { Canvas, extend } from '@react-three/fiber'
import { Stats } from '@react-three/drei'
import { io } from 'socket.io-client'
import parser from 'socket.io-msgpack-parser'
import Lighting from './Environment/Lighting'
import Ground from './Environment/Ground'
import Forest from './Environment/Forest'
import Loader from './Components/Loader'
import AllPlayersWrapper from './Players/AllPlayersWrapper'
import LocalPlayerWrapper from './Players/LocalPlayerWrapper'

import { Color, Fog, BoxGeometry, Material, Mesh } from 'three'
extend({ Color, Fog, BoxGeometry, Material, Mesh })

const clientSocket = io({ parser })

const App: React.FC = () => {
   const largeScenery = useRef([])
   const smallScenery = useRef([])
   // const remoteColliders = useRef<any>([])
   // const boxGemo = useMemo(() => new BoxGeometry(20, 20, 20), [])

   useEffect(() => {
      if (clientSocket) {
         clientSocket.on('largeScenery', (objects) => {
            largeScenery.current = objects
         })

         clientSocket.on('smallScenery', (objects) => {
            smallScenery.current = objects
         })

         // clientSocket.on('clientUpdates', (clients) => {
         //    let cols: Mesh<BoxGeometry, Material | Material[]>[] = []
         //    Object.keys(clients)
         //       .filter((clientKey) => clientKey !== clientSocket.id)
         //       .map((client) => {
         //          const { p, r } = clients[client]

         //          let hitBox = new Mesh(boxGemo)
         //          hitBox.position.set(p[0], p[1], p[2])
         //          hitBox.rotation.set(0, r, 0, 'XYZ')
         //          hitBox.updateMatrixWorld()
         //          cols.push(hitBox)
         //       })
         //    remoteColliders.current = cols
         // })
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
                  <LocalPlayerWrapper clientSocket={clientSocket} />
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
