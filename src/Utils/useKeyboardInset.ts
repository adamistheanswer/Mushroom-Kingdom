import { useEffect } from 'react'

/**
 * Mirrors the on-screen keyboard height into --mk-keyboard-inset. Mobile browsers
 * leave fixed elements pinned to the layout viewport, so without this the bottom
 * message bar ends up hidden behind the keyboard the moment it is focused.
 */
export const useKeyboardInset = () => {
   useEffect(() => {
      const viewport = window.visualViewport

      if (!viewport) {
         return
      }

      const updateInset = () => {
         const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
         document.documentElement.style.setProperty('--mk-keyboard-inset', `${Math.round(inset)}px`)

         // Focusing the composer makes mobile browsers scroll the layout viewport up to
         // reveal it. The body never scrolls back on its own, so once the keyboard closes
         // that offset would leave the HUD sitting above the top of the screen.
         if (inset === 0 && (window.scrollX !== 0 || window.scrollY !== 0)) {
            window.scrollTo(0, 0)
         }
      }

      updateInset()
      viewport.addEventListener('resize', updateInset)
      viewport.addEventListener('scroll', updateInset)

      return () => {
         viewport.removeEventListener('resize', updateInset)
         viewport.removeEventListener('scroll', updateInset)
         document.documentElement.style.removeProperty('--mk-keyboard-inset')
      }
   }, [])
}
