import { useEffect, useRef } from 'react'
import nipplejs from 'nipplejs'

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

   const handleMove = (event: any) => {
      const data = event.data

      if (!data?.vector) {
         return
      }

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

   const joyManager = useRef<ReturnType<typeof nipplejs.create> | null>(null)

   useEffect(() => {
      const zone = document.getElementById('joystickWrapper1')

      if (!joyManager.current && isTabletOrMobile && zone) {
         joyManager.current = nipplejs.create({
            zone,
            size: 120,
            maxNumberOfJoysticks: 1,
            mode: 'static',
            restJoystick: true,
            shape: 'circle',
            position: { left: '110px', top: '110px' },
         })
         joyManager.current.on('move', handleMove)
         joyManager.current.on('end', handleEnd)
      }

      return () => {
         if (joyManager.current) {
            joyManager.current.off('move', handleMove)
            joyManager.current.off('end', handleEnd)
            joyManager.current.destroy()
            joyManager.current = null
         }
      }
   }, [isTabletOrMobile])

   return inputs
}
