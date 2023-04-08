import React, { useRef, useEffect, useState } from 'react'
import { Text } from '@react-three/drei'
import { Vector3 } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { decode } from '@msgpack/msgpack'

interface NamePlateProps {
   position: Vector3
   isLocal: boolean
   clientId: any
   socket: WebSocket
}

interface WebSocketMessage {
   type: string
   payload: any
}

export const NamePlate = React.memo<NamePlateProps>(
   ({ position = new Vector3(0, 0, 0), isLocal, clientId, socket }) => {
      const nameplateRef = useRef<THREE.Group>(null!)
      const nameplateHeight = 13
      const [userName, setUserName] = useState('')

      const { camera } = useThree()

      useEffect(() => {
         const handleNameplate = (event) => {
            const message = decode(new Uint8Array(event.data)) as WebSocketMessage
            if (message.type === 'clientUpdates') {
               const updatedClients = message.payload
               updatedClients[clientId]?.userName && setUserName(updatedClients[clientId].userName)
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
      }, [socket])

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
      })

      useEffect(() => {
         nameplateRef.current.position.copy(position)
         nameplateRef.current.position.y = nameplateRef.current.position.y + nameplateHeight
      }, [position])

      return (
         <Text ref={nameplateRef} fontSize={1} color={isLocal ? 'yellow' : 'white'} anchorX="center" anchorY="middle">
            {userName ? userName : clientId}
         </Text>
      )
   }
)
