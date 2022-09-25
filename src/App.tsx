import React, { useEffect, Suspense, useRef } from 'react'
import { Canvas, extend } from '@react-three/fiber'
import { Stats, PerspectiveCamera, OrbitControls } from '@react-three/drei'
import { io } from 'socket.io-client'
import parser from 'socket.io-msgpack-parser'
import Lighting from './Environment/Lighting'
import Ground from './Environment/Ground'
import Forest from './Environment/Forest'
import Loader from './Components/Loader'
import AllPlayersWrapper from './Players/AllPlayersWrapper'
import LocalPlayerWrapper from './Players/LocalPlayerWrapper'
import styled from 'styled-components/macro'
import DynamicAntdTheme from 'dynamic-antd-theme'
import { Button } from 'antd'
import 'antd/dist/antd.css'

import { Color, Fog, BoxGeometry, Material, Mesh } from 'three'

extend({ Color, Fog, BoxGeometry, Material, Mesh })

const TopBarWrapper = styled.div`
   width: 100%;
   height: 50px;
   position: absolute;
   top: 0px;
   left: 0px;
   z-index: 10;
   background: yellow;
`

const BottomBarWrapper = styled.div`
   width: 100%;
   height: 50px;
   position: absolute;
   bottom: 0px;
   left: 0px;
   z-index: 10;
   // background: yellow;
`

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

   return (
      clientSocket && (
         <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
            {/* <TopBarWrapper>12345678</TopBarWrapper>
            <BottomBarWrapper>
               <Button type="ghost" shape="circle" size={'large'}>
                  ✋
               </Button>
            </BottomBarWrapper> */}
            <Canvas shadows>
               <PerspectiveCamera position={[25, 20, 25]} fov={70} makeDefault />
               <OrbitControls
                  autoRotate={false}
                  enableDamping={false}
                  enableZoom={false}
                  enablePan={false}
                  rotateSpeed={0.4}
                  target={[0, 0, 0]}
                  maxPolarAngle={Math.PI / 2}
                  makeDefault
               />
               <Stats />
               <color attach="background" args={['#444444']} />
               <fog attach="fog" color="#444444" near={50} far={300} />
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
