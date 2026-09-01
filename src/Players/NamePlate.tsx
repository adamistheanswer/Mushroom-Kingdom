import React, { useRef, useEffect, useMemo, useState } from 'react'
import { Text } from '@react-three/drei'
import { Group, Mesh, Vector3 } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { CHAT_BUBBLE_DURATION_MS, CHAT_BUBBLE_FADE_MS, ChatMessage, useChatStore } from '../State/chatStore'
import {
   recordChatBubbleRender,
   recordChatBubbleTickerUpdate,
   recordNameplateVisibility,
   registerChatBubble,
   registerNameplate,
} from '../Utils/nameplateDebugMetrics'

interface NamePlateProps {
   position: Vector3
   isLocal: boolean
   clientId: any
   userName?: string
   microphone?: boolean
   speaking?: boolean
}

const NAMEPLATE_HEIGHT = 13
const NAMEPLATE_MAX_DISTANCE = 180
const NAMEPLATE_SCREEN_MARGIN = 1.18
const CHAT_BUBBLE_TICK_MS = 250

export const ChatBubbleTicker = React.memo(() => {
   const messageCount = useChatStore((state) => state.messages.length)
   const visibleMessageCount = useChatStore((state) => Object.keys(state.visibleChatMessagesByClientId).length)
   const setChatBubbleNow = useChatStore((state) => state.setChatBubbleNow)

   useEffect(() => {
      if (messageCount === 0 || visibleMessageCount === 0) {
         return
      }

      recordChatBubbleTickerUpdate()
      setChatBubbleNow(Date.now())

      const interval = window.setInterval(() => {
         recordChatBubbleTickerUpdate()
         setChatBubbleNow(Date.now())
      }, CHAT_BUBBLE_TICK_MS)

      return () => window.clearInterval(interval)
   }, [messageCount, setChatBubbleNow, visibleMessageCount])

   return null
})

const ChatBubble = React.memo(({ message }: { message: ChatMessage }) => {
   const now = useChatStore((state) => state.chatBubbleNow)

   useEffect(() => {
      return registerChatBubble(message.id)
   }, [message.id])

   useEffect(() => {
      recordChatBubbleRender()
   })

   const bubbleAge = now - message.createdAt
   const bubbleFadeProgress = Math.max(0, bubbleAge - (CHAT_BUBBLE_DURATION_MS - CHAT_BUBBLE_FADE_MS)) / CHAT_BUBBLE_FADE_MS
   const bubbleOpacity = Math.max(0, 1 - bubbleFadeProgress)
   const bubbleWidth = Math.min(16, Math.max(6, message.text.length * 0.38))
   const bubbleHeight = Math.max(2.2, Math.ceil(message.text.length / 24) * 1.08 + 1)

   if (bubbleAge > CHAT_BUBBLE_DURATION_MS || bubbleOpacity <= 0) {
      return null
   }

   return (
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
            {message.text}
         </Text>
      </group>
   )
})

export const NamePlate = React.memo<NamePlateProps>(
   ({ position = new Vector3(0, 0, 0), isLocal, clientId, userName, microphone, speaking }) => {
      const nameplateRef = useRef<Group>(null!)
      const micIconRef = useRef<Group>(null!)
      const micLevelRefs = useRef<Mesh[]>([])
      const clientKey = String(clientId ?? '')
      const debugId = `${isLocal ? 'local' : 'remote'}:${clientKey}`
      const { camera } = useThree()
      const worldPosition = useMemo(() => new Vector3(), [])
      const projectedPosition = useMemo(() => new Vector3(), [])
      const latestChatMessage = useChatStore((state) => state.visibleChatMessagesByClientId[clientKey])
      const [renderVisible, setRenderVisible] = useState(isLocal)
      const renderVisibleRef = useRef(renderVisible)

      useEffect(() => {
         return registerNameplate(debugId)
      }, [debugId])

      useFrame(() => {
         const nameplate = nameplateRef.current
         if (!nameplate) {
            return
         }

         nameplate.getWorldPosition(worldPosition)
         let visibility: 'visible' | 'distance' | 'frustum' = 'visible'

         if (!isLocal) {
            if (camera.position.distanceTo(worldPosition) > NAMEPLATE_MAX_DISTANCE) {
               visibility = 'distance'
            } else {
               projectedPosition.copy(worldPosition).project(camera)

               if (
                  projectedPosition.z < -1 ||
                  projectedPosition.z > 1 ||
                  Math.abs(projectedPosition.x) > NAMEPLATE_SCREEN_MARGIN ||
                  Math.abs(projectedPosition.y) > NAMEPLATE_SCREEN_MARGIN
               ) {
                  visibility = 'frustum'
               }
            }
         }

         nameplate.visible = visibility === 'visible'
         recordNameplateVisibility(debugId, visibility)

         if (renderVisibleRef.current !== nameplate.visible) {
            renderVisibleRef.current = nameplate.visible
            setRenderVisible(nameplate.visible)
         }

         if (!nameplate.visible) {
            return
         }

         if (isLocal) {
            nameplate.rotation.x = 0
            nameplate.rotation.y = 0
            nameplate.rotation.z = 0
         } else {
            nameplate.quaternion.copy(camera.quaternion)
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
         nameplateRef.current.position.y = nameplateRef.current.position.y + NAMEPLATE_HEIGHT
      }, [position])

      return (
         <group ref={nameplateRef}>
            {renderVisible && latestChatMessage && <ChatBubble message={latestChatMessage} />}
            <Text fontSize={1} color={isLocal ? 'yellow' : 'white'} anchorX="center" anchorY="middle">
               {userName || clientId}
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
