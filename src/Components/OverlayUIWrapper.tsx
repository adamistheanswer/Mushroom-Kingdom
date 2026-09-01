import { useLoadingProgress } from '../Utils/useLoadingProgress'
import React from 'react'
import UserNameForm from './UserNameForm'
import PopoutMenu from './PopoutMenu'
import ChatPanel from './ChatPanel'

interface UserNameFormProps {
   socket: WebSocket
}

const OverlayUIWrapper: React.FC<UserNameFormProps> = ({ socket }) => {
   const { loaded } = useLoadingProgress()

   return (
      <>
         {loaded >= 25 && (
            <>
               <UserNameForm socket={socket} />
               <PopoutMenu socket={socket} />
               <ChatPanel socket={socket} />
            </>
         )}
      </>
   )
}

export default OverlayUIWrapper
