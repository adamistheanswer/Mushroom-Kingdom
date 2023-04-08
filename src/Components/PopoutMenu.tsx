import { encode } from '@msgpack/msgpack'
import React, { useState } from 'react'

interface WebSocketMessage {
   type: string
   payload: any
}

interface PopoutMenuProps {
   socket: WebSocket
}

function menuIndexToText(index) {
   switch (index) {
      case 0:
         return 'Whomp'
      case 1:
         return 'Wiggle'
      case 2:
         return 'Shimmy'
      case 3:
         return 'Punch'
      case 4:
         return 'Salute'
      case 5:
         return 'Wave'
      default:
         'Idle'
   }
   return 'Idle'
}

function menuIndexToEmoji(index) {
    switch (index) {
       case 0:
          return '👊'; // Whomp
       case 1:
          return '🕺'; // Wiggle
       case 2:
          return '💃'; // Shimmy
       case 3:
          return '🥊'; // Punch
       case 4:
          return '🖖'; // Salute
       case 5:
          return '👋'; // Wave
       default:
          return '😐'; // Idle
    }
}
function playerActionsToAnimationIndex(action) {
   switch (action) {
      case 'Whomp':
         return '0'
      case 'Wiggle':
         return '1'
      case 'Shimmy':
         return '2'
      case 'Punch':
         return '4'
      case 'Salute':
         return '5'
      case 'Wave':
         return '10'
      case 'stop':
         return '3'
      default:
         '3'
   }
   return '3'
}

const PopoutMenu: React.FC<PopoutMenuProps> = ({ socket }) => {
   const [menuOpen, setMenuOpen] = useState(false)

   const toggleMenu = () => {
      setMenuOpen(!menuOpen)
   }

   const containerStyle = {
      position: 'fixed',
      left: '20px',
      bottom: '20px',
   }

   const mainButtonStyle = {
      backgroundColor: 'rgba(0, 50, 0, 0.5)',
      border: '2px solid darkgreen',
      borderRadius: '50%',
      color: 'white',
      cursor: 'pointer',
      fontSize: '16px',
      padding: '0',
      width: '50px',
      height: '50px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: '0.3s',
   }

   const menuIconStyle = {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
   }

   const menuIconLine = {
      backgroundColor: 'lightgray',
      height: '2px',
      width: '20px',
   }

   const openMenuStyle = {
      opacity: 1,
      visibility: 'visible',
   }

   const closedMenuStyle = {
      opacity: 0,
      visibility: 'hidden',
   }

   const menuStyle = {
      position: 'absolute',
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridGap: '10px',
      bottom: '60px',
      transition: 'all 0.3s',
      ...(menuOpen ? openMenuStyle : closedMenuStyle),
   }


   
   const itemButtonStyle = {
    backgroundColor: 'rgba(0, 50, 0, 0.5)',
    border: '2px solid darkgreen',
    borderRadius: '50%',
    color: 'white',
    cursor: 'pointer',
    fontSize: '24px', // Increase the font size for larger emoji icons
    width: '50px',
    height: '50px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: '0.3s',
 };

   const handleButtonAction = (action: string) => {
      const message: WebSocketMessage = {
         type: 'playerAction',
         payload: {
            action: action,
         },
      }

      const encodedMessage = encode(message)
      socket.send(encodedMessage)
   }

   return (
      //@ts-ignore
      <div style={containerStyle}>
         <button
            style={mainButtonStyle}
            onClick={toggleMenu}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0, 50, 0, 0.8)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0, 50, 0, 0.5)')}
         >
            {/* @ts-ignore */}
            <div style={menuIconStyle}>
               <div style={menuIconLine}></div>
               <div style={menuIconLine}></div>
               <div style={menuIconLine}></div>
            </div>
         </button>
         {/* @ts-ignore */}
         <div style={menuStyle}>
            {Array.from({ length: 6 }, (_, i) => (
               <button
                  key={i}
                  style={itemButtonStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0, 50, 0, 0.8)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0, 50, 0, 0.5)')}
                  onMouseDown={() => handleButtonAction(playerActionsToAnimationIndex(menuIndexToText(i)))}
                  onMouseUp={() => handleButtonAction('3')}
               >
                  {menuIndexToEmoji(i)}
               </button>
            ))}
         </div>
      </div>
   )
}

export default PopoutMenu
