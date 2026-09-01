import { RefObject, useEffect } from 'react'

/** iOS drip feeds viewport updates through the keyboard animation, so keep measuring after one. */
const SETTLE_MS = 800

/**
 * Mirrors the on-screen keyboard height into --mk-keyboard-inset and the visible
 * height into --mk-viewport-height. Mobile browsers leave fixed elements pinned to
 * the layout viewport, so without this the bottom message bar ends up hidden behind
 * the keyboard the moment it is focused.
 *
 * The composer element is measured while it is focused: iOS reports the viewport pan
 * late and sometimes never lands on numbers that add up, so the maths below is only a
 * starting point that gets topped up from where the composer really is on screen.
 */
export const useKeyboardInset = (composerRef: RefObject<HTMLElement>) => {
   useEffect(() => {
      const viewport = window.visualViewport
      const composer = composerRef.current

      if (!viewport) {
         return
      }

      const root = document.documentElement
      let frame = 0
      let settleUntil = 0
      let correction = 0
      let typing = false
      let lastInset = 0
      let lastHeight = 0

      const measure = () => {
         // Fixed elements stay pinned to the layout viewport while iOS shrinks and pans
         // the visual viewport around the keyboard, so the gap between the two bottom
         // edges is how far the composer has to ride up.
         const base = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)

         if (typing && composer) {
            const overlap = composer.getBoundingClientRect().bottom - (viewport.offsetTop + viewport.height)

            if (overlap > 1) {
               correction = Math.min(correction + overlap, window.innerHeight * 0.6)
            }
         } else {
            correction = 0
         }

         const inset = Math.round(base + correction)
         const height = Math.round(viewport.height)

         if (inset !== lastInset) {
            lastInset = inset
            root.style.setProperty('--mk-keyboard-inset', `${inset}px`)
         }

         if (height !== lastHeight) {
            lastHeight = height
            root.style.setProperty('--mk-viewport-height', `${height}px`)
         }

         // Focusing the composer makes mobile browsers scroll the layout viewport up to
         // reveal it. The body never scrolls back on its own, so once the keyboard closes
         // that offset would leave the HUD sitting above the top of the screen.
         if (!typing && inset === 0 && (window.scrollX !== 0 || window.scrollY !== 0)) {
            window.scrollTo(0, 0)
         }
      }

      const tick = () => {
         measure()
         frame = performance.now() < settleUntil ? requestAnimationFrame(tick) : 0
      }

      const settle = () => {
         settleUntil = performance.now() + SETTLE_MS

         if (!frame) {
            frame = requestAnimationFrame(tick)
         }
      }

      const startTyping = () => {
         typing = true
         root.dataset.mkTyping = 'true'
         settle()
      }

      const stopTyping = () => {
         typing = false
         correction = 0
         delete root.dataset.mkTyping
         settle()
      }

      measure()
      viewport.addEventListener('resize', settle)
      viewport.addEventListener('scroll', settle)
      window.addEventListener('orientationchange', settle)
      composer?.addEventListener('focusin', startTyping)
      composer?.addEventListener('focusout', stopTyping)

      return () => {
         if (frame) {
            cancelAnimationFrame(frame)
         }

         viewport.removeEventListener('resize', settle)
         viewport.removeEventListener('scroll', settle)
         window.removeEventListener('orientationchange', settle)
         composer?.removeEventListener('focusin', startTyping)
         composer?.removeEventListener('focusout', stopTyping)
         delete root.dataset.mkTyping
         root.style.removeProperty('--mk-keyboard-inset')
         root.style.removeProperty('--mk-viewport-height')
      }
   }, [composerRef])
}
