import React, { useRef, useEffect, useMemo, useState } from 'react'
import { Text } from '@react-three/drei'
import { Group, Mesh, Vector3 } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { decode } from '@msgpack/msgpack'
import { CHAT_BUBBLE_DURATION_MS, CHAT_BUBBLE_FADE_MS, useChatStore } from '../State/chatStore'

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
      const [now, setNow] = useState(Date.now())
      const messages = useChatStore((state) => state.messages)

      const { camera } = useThree()
      const latestChatMessage = useMemo(() => {
         const cutoff = now - CHAT_BUBBLE_DURATION_MS

         for (let index = messages.length - 1; index >= 0; index--) {
            const message = messages[index]
            if (message.clientId === clientId && message.createdAt >= cutoff) {
               return message
            }
         }

         return null
      }, [clientId, messages, now])
      const bubbleAge = latestChatMessage ? now - latestChatMessage.createdAt : CHAT_BUBBLE_DURATION_MS
      const bubbleFadeProgress = Math.max(0, bubbleAge - (CHAT_BUBBLE_DURATION_MS - CHAT_BUBBLE_FADE_MS)) / CHAT_BUBBLE_FADE_MS
      const bubbleOpacity = latestChatMessage ? Math.max(0, 1 - bubbleFadeProgress) : 0
      const bubbleWidth = latestChatMessage ? Math.min(16, Math.max(6, latestChatMessage.text.length * 0.38)) : 6
      const bubbleHeight = latestChatMessage ? Math.max(2.2, Math.ceil(latestChatMessage.text.length / 24) * 1.08 + 1) : 2.2

      useEffect(() => {
         const interval = window.setInterval(() => setNow(Date.now()), 250)
         return () => window.clearInterval(interval)
      }, [])

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
            {latestChatMessage && (
               <group position={[0, 2.5 + bubbleHeight / 2, 0]}>
                  <mesh position={[0, 0, -0.04]}>
                     <planeGeometry args={[bubbleWidth, bubbleHeight]} />
                     <meshBasicMaterial color="#10291d" transparent opacity={bubbleOpacity * 0.88} depthWrite={false} />
                  </mesh>
                  <Text
                     fontSize={0.95}
                     color="white"
                     fillOpacity={bubbleOpacity}
                     anchorX="center"
                     anchorY="middle"
                     maxWidth={bubbleWidth - 1}
                     textAlign="center"
                  >
                     {latestChatMessage.text}
                  </Text>
               </group>
            )}
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
