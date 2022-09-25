import { useEffect, useRef } from 'react'
import nipplejs from 'nipplejs'

declare interface ManagerOptions {
   zone?: HTMLElement
   color?: string
   size?: number
   threshold?: number
   fadeTime?: number
   multitouch?: boolean
   maxNumberOfNipples?: number
   dataOnly?: boolean
   position?: any
   mode?: string
   restOpacity?: number
   catchDistance?: MimeType
}

export function useJoystickControls(isTabletOrMobile: boolean) {
   const inputs = useRef({
      forwardJoy: 0,
      backwardJoy: 0,
      leftJoy: 0,
      rightJoy: 0,
   })

   const handleEnd = () => {
      inputs.current.forwardJoy = 0
      inputs.current.backwardJoy = 0
      inputs.current.leftJoy = 0
      inputs.current.rightJoy = 0
   }

   const handleMove = (_: {}, data: any) => {
      const forward = data.vector.y
      const turn = data.vector.x

      let forwardLimiter = 0
      if (Math.abs(forward) > 0.4) {
         forwardLimiter = Math.abs(forward)
      }

      if (forward > 0) {
         inputs.current.forwardJoy = forwardLimiter
         inputs.current.backwardJoy = 0
      } else if (forward < 0) {
         inputs.current.forwardJoy = 0
         inputs.current.backwardJoy = forwardLimiter
      }

      let turnLimiter = 0
      if (Math.abs(turn) > 0.4) {
         turnLimiter = Math.abs(turn)
      }

      if (turn > 0) {
         inputs.current.leftJoy = 0
         inputs.current.rightJoy = turnLimiter
      } else if (turn < 0) {
         inputs.current.leftJoy = turnLimiter
         inputs.current.rightJoy = 0
      }
   }

   let joyManager

   useEffect(() => {
      if (!joyManager && isTabletOrMobile) {
         joyManager = nipplejs.create({
            zone: document.getElementById('joystickWrapper1')!,
            size: 120,
            maxNumberOfNipples: 1,
            mode: 'static',
            restJoystick: true,
            shape: 'circle',
            position: { bottom: '80px', right: '80px' },
            dynamicPage: true,
         }) as ManagerOptions
         joyManager['0'].on('move', handleMove)
         joyManager['0'].on('end', handleEnd)
      }

      return () => {
         if (joyManager) {
            joyManager['0'].off('move', handleMove)
            joyManager['0'].off('end', handleEnd)
         }
      }
   }, [isTabletOrMobile])

   return inputs
}
