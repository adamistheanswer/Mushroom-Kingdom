import { encode } from '@msgpack/msgpack'
import React, { useState } from 'react'
import usePlayerActionStore from '../State/playerActionStore'

interface WebSocketMessage {
   type: string
   payload: any
}

interface PopoutMenuProps {
   socket: WebSocket
}

const menuTextLookup = {
   0: 'Whomp',
   1: 'Wiggle',
   2: 'Shimmy',
   3: 'Punch',
   4: 'Salute',
   5: 'Wave',
}

const menuEmojiLookup = {
   0: '🤘', // Whomp
   1: '🕺', // Wiggle
   2: '💃', // Shimmy
   3: '🥊', // Punch
   4: '🖖', // Salute
   5: '👋', // Wave
   default: '😐', // Idle
}

const playerActionsLookup = {
   Whomp: '0',
   Wiggle: '1',
   Shimmy: '2',
   Punch: '4',
   Salute: '5',
   Wave: '10',
   stop: '3',
}

const PopoutMenu: React.FC<PopoutMenuProps> = ({ socket }) => {
   const [menuOpen, setMenuOpen] = useState(false)
   const selectedMenuAction = usePlayerActionStore((state) => state.selectedMenuAction)
   const setSelectedMenuAction = usePlayerActionStore((state) => state.setSelectedMenuAction)

   const toggleMenu = () => {
      const nextMenuOpen = !menuOpen

      if (!nextMenuOpen && selectedMenuAction) {
         setSelectedMenuAction(null)
         sendButtonAction(playerActionsLookup['stop'])
      }

      setMenuOpen(nextMenuOpen)
   }

   const containerStyle = {
      position: 'fixed',
      left: '20px',
      top: '20px',
      zIndex: 30,
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
      top: '60px',
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
      userSelect: 'none',
   }

   const sendButtonAction = (action: string) => {
      const message: WebSocketMessage = {
         type: 'state_set_client_action',
         payload: {
            action: action,
         },
      }

      const encodedMessage = encode(message)
      if (socket.readyState === WebSocket.OPEN) {
         socket.send(encodedMessage)
      }
   }

   const handleButtonAction = (action: string) => {
      const nextAction = selectedMenuAction === action ? null : action

      setSelectedMenuAction(nextAction)
      sendButtonAction(nextAction ?? playerActionsLookup['stop'])
   }

   return (
      //@ts-ignore
      <div className="popout-menu" style={containerStyle}>
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
            {Array.from({ length: 6 }, (_, i) => {
               const action = playerActionsLookup[menuTextLookup[i] || 'default']
               const isSelected = selectedMenuAction === action

               return (
                  <button
                     key={i}
                     //@ts-ignore
                     style={{
                        ...itemButtonStyle,
                        backgroundColor: isSelected ? 'rgba(10, 120, 40, 0.85)' : itemButtonStyle.backgroundColor,
                        border: isSelected ? '2px solid limegreen' : itemButtonStyle.border,
                        transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                     }}
                     onClick={() => handleButtonAction(action)}
                     onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0, 50, 0, 0.8)')}
                     onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = isSelected
                           ? 'rgba(10, 120, 40, 0.85)'
                           : 'rgba(0, 50, 0, 0.5)')
                     }
                  >
                     {menuEmojiLookup[i] || menuEmojiLookup.default}
                  </button>
               )
            })}
         </div>
      </div>
   )
}

export default PopoutMenu
