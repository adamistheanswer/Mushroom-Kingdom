import React, { useState } from 'react'

const PopoutMenu: React.FC = () => {
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
      borderRadius: '5px',
      color: 'white',
      cursor: 'pointer',
      fontSize: '16px',
      padding: '5px 10px',
      transition: '0.3s',
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
            {Array.from({ length: 8 }, (_, i) => (
               <button
                  key={i}
                  style={itemButtonStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0, 50, 0, 0.8)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0, 50, 0, 0.5)')}
               >
                  Button {i + 1}
               </button>
            ))}
         </div>
      </div>
   )
}

export default PopoutMenu
