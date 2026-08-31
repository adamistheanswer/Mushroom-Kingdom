import React, { useRef, useEffect, useState } from 'react'
import { Text } from '@react-three/drei'
import { Group, Mesh, Vector3 } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { decode } from '@msgpack/msgpack'

interface NamePlateProps {
   position: Vector3
   isLocal: boolean
   clientId: any
   socket: WebSocket
   userName?: string
   microphone?: boolean
   speaking?: boolean
}

interface WebSocketMessage {
   type: string
   payload: any
}

function getClientUpdate(payload, clientId) {
   if (Array.isArray(payload)) {
      return payload.find((client) => client.id === clientId)
   }

   return payload?.[clientId]
}

export const NamePlate = React.memo<NamePlateProps>(
   ({ position = new Vector3(0, 0, 0), isLocal, clientId, socket, userName, microphone, speaking }) => {
      const nameplateRef = useRef<Group>(null!)
      const micIconRef = useRef<Group>(null!)
      const micLevelRefs = useRef<Mesh[]>([])
      const nameplateHeight = 13
      const [socketUserName, setSocketUserName] = useState('')

      const { camera } = useThree()

      useEffect(() => {
         if (userName !== undefined) {
            return
         }

         const handleNameplate = (event) => {
            const message = decode(new Uint8Array(event.data)) as WebSocketMessage
            if (message.type === 'clientUpdates') {
               const updatedClient = getClientUpdate(message.payload, clientId)
               updatedClient?.userName && setSocketUserName(updatedClient.userName)
            }
         }

         if (socket) {
            socket.addEventListener('message', handleNameplate)
         }

         return () => {
            if (socket) {
               socket.removeEventListener('message', handleNameplate)
            }
         }
      }, [clientId, socket, userName])

      useFrame(() => {
         if (isLocal) {
            nameplateRef.current.rotation.x = 0
            nameplateRef.current.rotation.y = 0
            nameplateRef.current.rotation.z = 0
         } else {
            nameplateRef.current.rotation.x = camera.rotation.x
            nameplateRef.current.rotation.y = camera.rotation.y
            nameplateRef.current.rotation.z = camera.rotation.z
         }

         if (micIconRef.current) {
            const pulse = speaking ? 1 + Math.sin(performance.now() * 0.012) * 0.18 : 1
            micIconRef.current.scale.setScalar(pulse)
         }

         for (let index = 0; index < micLevelRefs.current.length; index++) {
            const level = micLevelRefs.current[index]
            if (!level) {
               continue
            }

            const idleScale = index === 1 ? 0.75 : 0.5
            const speakingScale = 0.45 + Math.abs(Math.sin(performance.now() * 0.012 + index * 1.7)) * 0.75
            level.scale.y = speaking ? speakingScale : idleScale
         }
      })

      useEffect(() => {
         nameplateRef.current.position.copy(position)
         nameplateRef.current.position.y = nameplateRef.current.position.y + nameplateHeight
      }, [position])

      return (
         <group ref={nameplateRef}>
            <Text fontSize={1} color={isLocal ? 'yellow' : 'white'} anchorX="center" anchorY="middle">
               {userName || socketUserName || clientId}
            </Text>
            {microphone && (
               <group ref={micIconRef} position={[4.45, 0, 0]}>
                  <mesh position={[0, 0, -0.01]}>
                     <circleGeometry args={[0.48, 28]} />
                     <meshBasicMaterial color={speaking ? '#123f24' : '#1f2933'} transparent opacity={0.9} />
                  </mesh>
                  {[-0.18, 0, 0.18].map((x, index) => (
                     <mesh
                        key={x}
                        ref={(element) => {
                           if (element) {
                              micLevelRefs.current[index] = element
                           }
                        }}
                        position={[x, 0, 0.02]}
                     >
                        <boxGeometry args={[0.1, 0.62, 0.02]} />
                        <meshBasicMaterial color={speaking ? '#64ff8a' : '#ffffff'} />
                     </mesh>
                  ))}
               </group>
            )}
         </group>
      )
   }
)
