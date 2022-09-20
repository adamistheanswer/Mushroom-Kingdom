import { useEffect, useRef } from 'react'

export function useKeyPress(target, event) {
   useEffect(() => {
      const downHandler = ({ key }) => target.indexOf(key) !== -1 && event(true)
      const upHandler = ({ key }) => target.indexOf(key) !== -1 && event(false)
      window.addEventListener('keydown', downHandler)
      window.addEventListener('keyup', upHandler)
      return () => {
         window.removeEventListener('keydown', downHandler)
         window.removeEventListener('keyup', upHandler)
      }
   }, [])
}

export function useKeyboardControls() {
   const keys = useRef({
      forward: false,
      backward: false,
      left: false,
      right: false,
      dance1: false,
      dance2: false,
      excited: false,
      punch: false,
      salute: false,
      wave: false,
   })

   useKeyPress(['ArrowUp', 'w'], (pressed) => (keys.current.forward = pressed))
   useKeyPress(['ArrowDown', 's'], (pressed) => (keys.current.backward = pressed))
   useKeyPress(['ArrowLeft', 'a'], (pressed) => (keys.current.left = pressed))
   useKeyPress(['ArrowRight', 'd'], (pressed) => (keys.current.right = pressed))
   useKeyPress(['1'], (pressed) => (keys.current.dance1 = pressed))
   useKeyPress(['2'], (pressed) => (keys.current.dance2 = pressed))
   useKeyPress(['3'], (pressed) => (keys.current.excited = pressed))
   useKeyPress(['4'], (pressed) => (keys.current.punch = pressed))
   useKeyPress(['5'], (pressed) => (keys.current.salute = pressed))
   useKeyPress(['6'], (pressed) => (keys.current.wave = pressed))
   return keys
}
