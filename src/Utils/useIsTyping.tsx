import { useEffect, useRef } from 'react'

export const useIsTyping = () => {
   const isTyping = useRef(false)

   useEffect(() => {
      const handleFocus = (event: FocusEvent) => {
         if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
            isTyping.current = true
         }
      }

      const handleBlur = () => {
         isTyping.current = false
      }

      window.addEventListener('focus', handleFocus, true)
      window.addEventListener('blur', handleBlur, true)

      return () => {
         window.removeEventListener('focus', handleFocus, true)
         window.removeEventListener('blur', handleBlur, true)
      }
   }, [])

   return isTyping
}
