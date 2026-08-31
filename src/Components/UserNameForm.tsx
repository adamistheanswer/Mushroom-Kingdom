import React, { useState } from 'react'
import { encode } from '@msgpack/msgpack'
import { useIsMobile } from '../Utils/useIsMobile'

interface WebSocketMessage {
   type: string
   payload: any
}

interface UserNameFormProps {
   socket: WebSocket
}

const UserNameForm: React.FC<UserNameFormProps> = ({ socket }) => {
   const [userName, setUserName] = useState('')
   const isMobile = useIsMobile('(max-width: 480px)')

   const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      setUserName(event.target.value)

      const message: WebSocketMessage = {
         type: 'state_set_username',
         payload: event.target.value,
      }

      if (socket.readyState === WebSocket.OPEN) {
         socket.send(encode(message))
      }
   }

   const formStyle = {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'absolute',
      top: isMobile ? 'max(20px, env(safe-area-inset-top))' : '10px',
      left: isMobile ? '84px' : '50%',
      right: isMobile ? '84px' : 'auto',
      transform: isMobile ? 'none' : 'translateX(-50%)',
      zIndex: 100,
   }

   const inputStyle = {
      background: 'rgba(0, 50, 0, 0.5)',
      border: '2px solid darkgreen',
      borderRadius: '5px',
      color: 'limegreen',
      fontSize: '16px',
      padding: '5px 10px',
      textAlign: 'center',
      margin: '5px 0',
      width: isMobile ? '100%' : '200px',
      boxSizing: 'border-box',
      transition: '0.3s',
   }

   return (
      //@ts-ignore
      <form style={formStyle}>
         <input
            type="text"
            value={userName}
            onChange={handleChange}
            placeholder="Username"
            maxLength={15}
            //@ts-ignore
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.background = 'rgba(0, 50, 0, 0.8)')}
            onBlur={(e) => (e.currentTarget.style.background = 'rgba(0, 50, 0, 0.5)')}
         />
      </form>
   )
}

export default UserNameForm
