import { useCallback, useEffect, useRef, useState } from 'react'

const JOYSTICK_DEADZONE = 0.4
const JOYSTICK_SIZE = 120
const JOYSTICK_STICK_SIZE = 64
const JOYSTICK_RADIUS = JOYSTICK_SIZE / 2
const JOYSTICK_STICK_MAX_OFFSET = (JOYSTICK_SIZE - JOYSTICK_STICK_SIZE) / 2

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
   const baseRef = useRef<HTMLDivElement>(null)
   const pointerId = useRef<number | null>(null)
   const [stickOffset, setStickOffset] = useState({ x: 0, y: 0 })

   const resetJoystick = useCallback(() => {
      pointerId.current = null
      setStickOffset({ x: 0, y: 0 })
      resetJoystickControls()
   }, [])

   const updateJoystickFromPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
      const rect = baseRef.current?.getBoundingClientRect()
      if (!rect) {
         return
      }

      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const rawX = event.clientX - centerX
      const rawY = event.clientY - centerY
      const distance = Math.hypot(rawX, rawY)
      const limiter = distance > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / distance : 1
      const x = rawX * limiter
      const y = rawY * limiter
      const normalizedX = x / JOYSTICK_RADIUS
      const normalizedY = -y / JOYSTICK_RADIUS

      setStickOffset({
         x: normalizedX * JOYSTICK_STICK_MAX_OFFSET,
         y: -normalizedY * JOYSTICK_STICK_MAX_OFFSET,
      })
      setJoystickAxes(normalizedX, normalizedY)
   }, [])

   const handlePointerDown = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
         event.preventDefault()
         event.stopPropagation()
         pointerId.current = event.pointerId
         event.currentTarget.setPointerCapture(event.pointerId)
         updateJoystickFromPointer(event)
      },
      [updateJoystickFromPointer]
   )

   const handlePointerMove = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
         if (pointerId.current !== event.pointerId) {
            return
         }

         event.preventDefault()
         event.stopPropagation()
         updateJoystickFromPointer(event)
      },
      [updateJoystickFromPointer]
   )

   const handlePointerUp = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
         if (pointerId.current !== event.pointerId) {
            return
         }

         event.preventDefault()
         event.stopPropagation()
         resetJoystick()
      },
      [resetJoystick]
   )

   const stickStyle = {
      transform: `translate(calc(-50% + ${stickOffset.x}px), calc(-50% + ${stickOffset.y}px))`,
   }

   return (
      <div
         id="joystickWrapper1"
         onPointerDown={handlePointerDown}
         onPointerMove={handlePointerMove}
         onPointerUp={handlePointerUp}
         onPointerCancel={handlePointerUp}
      >
         <div ref={baseRef} className="mobileJoystickBase" role="presentation">
            <div className="mobileJoystickStick" style={stickStyle} />
         </div>
      </div>
   )
}
