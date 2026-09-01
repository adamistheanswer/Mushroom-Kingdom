import { useEffect } from 'react'

/** How much of the layout viewport the keyboard has to cover before we call it open. */
const KEYBOARD_THRESHOLD_PX = 120

/**
 * Publishes the visual viewport rect as CSS custom properties, plus a data-mk-keyboard
 * flag on <html> while the on-screen keyboard is up.
 *
 * Mobile browsers keep `position: fixed` pinned to the *layout* viewport, then shrink and
 * pan the *visual* viewport around the keyboard. That is why the composer ended up behind
 * the keyboard and the top-left controls scrolled off screen. Instead of guessing offsets
 * per element, the whole HUD rides on one wrapper sized and translated to these values, so
 * every fixed child is laid out against the part of the page the user can actually see.
 */
export const useVisualViewport = () => {
   useEffect(() => {
      const root = document.documentElement
      const viewport = window.visualViewport
      let frame = 0

      const apply = () => {
         frame = 0

         const width = viewport?.width ?? window.innerWidth
         const height = viewport?.height ?? window.innerHeight

         root.style.setProperty('--mk-vv-width', `${width}px`)
         root.style.setProperty('--mk-vv-height', `${height}px`)
         root.style.setProperty('--mk-vv-left', `${viewport?.offsetLeft ?? 0}px`)
         root.style.setProperty('--mk-vv-top', `${viewport?.offsetTop ?? 0}px`)

         if (window.innerHeight - height > KEYBOARD_THRESHOLD_PX) {
            root.dataset.mkKeyboard = 'open'
         } else {
            delete root.dataset.mkKeyboard
         }

         // Nothing on the page scrolls, but iOS still pans the document to reveal a focused
         // input and never pans back, which drags every fixed element with it. Put it back.
         if (window.scrollX !== 0 || window.scrollY !== 0) {
            window.scrollTo(0, 0)
         }
      }

      // iOS reports the viewport in steps through the keyboard animation, so coalesce the
      // burst of events into one measurement per frame.
      const schedule = () => {
         if (!frame) {
            frame = requestAnimationFrame(apply)
         }
      }

      apply()
      viewport?.addEventListener('resize', schedule)
      viewport?.addEventListener('scroll', schedule)
      window.addEventListener('resize', schedule)
      window.addEventListener('orientationchange', schedule)
      window.addEventListener('scroll', schedule)

      return () => {
         if (frame) {
            cancelAnimationFrame(frame)
         }

         viewport?.removeEventListener('resize', schedule)
         viewport?.removeEventListener('scroll', schedule)
         window.removeEventListener('resize', schedule)
         window.removeEventListener('orientationchange', schedule)
         window.removeEventListener('scroll', schedule)
         delete root.dataset.mkKeyboard
         root.style.removeProperty('--mk-vv-width')
         root.style.removeProperty('--mk-vv-height')
         root.style.removeProperty('--mk-vv-left')
         root.style.removeProperty('--mk-vv-top')
      }
   }, [])
}
