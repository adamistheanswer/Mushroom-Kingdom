import { useCallback, useEffect, useRef } from 'react'
import { Joystick } from 'react-joystick-component'

interface JoystickUpdateEvent {
   x: number | null
   y: number | null
}

const JOYSTICK_DEADZONE = 0.4

const inputs = {
   current: {
      forwardJoy: 0,
      backwardJoy: 0,
      leftJoy: 0,
      rightJoy: 0,
   },
}

const resetJoystickControls = () => {
   inputs.current.forwardJoy = 0
   inputs.current.backwardJoy = 0
   inputs.current.leftJoy = 0
   inputs.current.rightJoy = 0
}

const applyDeadzone = (value: number) => {
   const absoluteValue = Math.abs(value)
   return absoluteValue > JOYSTICK_DEADZONE ? absoluteValue : 0
}

const setJoystickAxes = (x: number, y: number) => {
   const forwardLimiter = applyDeadzone(y)
   if (y > JOYSTICK_DEADZONE) {
      inputs.current.forwardJoy = forwardLimiter
      inputs.current.backwardJoy = 0
   } else if (y < -JOYSTICK_DEADZONE) {
      inputs.current.forwardJoy = 0
      inputs.current.backwardJoy = forwardLimiter
   } else {
      inputs.current.forwardJoy = 0
      inputs.current.backwardJoy = 0
   }

   const turnLimiter = applyDeadzone(x)
   if (x > JOYSTICK_DEADZONE) {
      inputs.current.leftJoy = 0
      inputs.current.rightJoy = turnLimiter
   } else if (x < -JOYSTICK_DEADZONE) {
      inputs.current.leftJoy = turnLimiter
      inputs.current.rightJoy = 0
   } else {
      inputs.current.leftJoy = 0
      inputs.current.rightJoy = 0
   }
}

export function useJoystickControls() {
   useEffect(() => {
      return resetJoystickControls
   }, [])

   return inputs
}

export function MobileJoystick() {
   const wrapperRef = useRef<HTMLDivElement>(null)

   const handleMove = useCallback((event: JoystickUpdateEvent) => {
      setJoystickAxes(event.x ?? 0, event.y ?? 0)
   }, [])

   useEffect(() => {
      const stickButton = wrapperRef.current?.querySelector('button')
      stickButton?.setAttribute('type', 'button')
      stickButton?.setAttribute('aria-label', 'Movement joystick')
   }, [])

   return (
      <div
         id="joystickWrapper1"
         ref={wrapperRef}
         onPointerDown={(event) => event.stopPropagation()}
         onPointerMove={(event) => event.stopPropagation()}
         onPointerUp={(event) => event.stopPropagation()}
         onTouchStart={(event) => event.stopPropagation()}
         onTouchMove={(event) => event.stopPropagation()}
         onTouchEnd={(event) => event.stopPropagation()}
      >
         <Joystick
            size={120}
            stickSize={64}
            baseColor="rgba(0, 50, 0, 0.9)"
            stickColor="rgba(28, 120, 42, 0.95)"
            throttle={16}
            sticky={false}
            minDistance={8}
            move={handleMove}
            stop={resetJoystickControls}
         />
      </div>
   )
}
