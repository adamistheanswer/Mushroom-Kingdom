import React, { useState } from 'react'
import { encode } from '@msgpack/msgpack'

interface WebSocketMessage {
   type: string
   payload: any
}

interface UserNameFormProps {
   socket: WebSocket
}

const UserNameForm: React.FC<UserNameFormProps> = ({ socket }) => {
   const [userName, setUserName] = useState('')

   const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      setUserName(event.target.value)

      const message: WebSocketMessage = {
         type: 'state_set_username',
         payload: event.target.value,
      }

      socket.send(encode(message))
   }

   const formStyle = {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'absolute',
      top: '10px',
      left: '50%',
      transform: 'translateX(-50%)',
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
      width: '200px',
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
