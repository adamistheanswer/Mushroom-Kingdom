import { useEffect, useRef } from 'react'
import nipplejs from 'nipplejs'

export function useJoystickControls() {
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
      const mediaQuery = window.matchMedia('(max-width: 1224px)')
      const zone = document.getElementById('joystickWrapper1')

      const stopJoystickPointerEvent = (event: Event) => {
         event.stopPropagation()
      }

      const destroyJoystick = () => {
         handleEnd()

         if (joyManager.current) {
            joyManager.current.off('move', handleMove)
            joyManager.current.off('end', handleEnd)
            joyManager.current.destroy()
            joyManager.current = null
         }
      }

      const createJoystick = () => {
         if (joyManager.current || !zone) {
            return
         }

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

      const syncJoystick = () => {
         if (mediaQuery.matches) {
            createJoystick()
         } else {
            destroyJoystick()
         }
      }

      zone?.addEventListener('pointerdown', stopJoystickPointerEvent)
      zone?.addEventListener('pointermove', stopJoystickPointerEvent)
      zone?.addEventListener('pointerup', stopJoystickPointerEvent)
      zone?.addEventListener('touchstart', stopJoystickPointerEvent)
      zone?.addEventListener('touchmove', stopJoystickPointerEvent)
      zone?.addEventListener('touchend', stopJoystickPointerEvent)
      mediaQuery.addEventListener('change', syncJoystick)
      syncJoystick()

      return () => {
         mediaQuery.removeEventListener('change', syncJoystick)
         zone?.removeEventListener('pointerdown', stopJoystickPointerEvent)
         zone?.removeEventListener('pointermove', stopJoystickPointerEvent)
         zone?.removeEventListener('pointerup', stopJoystickPointerEvent)
         zone?.removeEventListener('touchstart', stopJoystickPointerEvent)
         zone?.removeEventListener('touchmove', stopJoystickPointerEvent)
         zone?.removeEventListener('touchend', stopJoystickPointerEvent)
         destroyJoystick()
      }
   }, [])

   return inputs
}
