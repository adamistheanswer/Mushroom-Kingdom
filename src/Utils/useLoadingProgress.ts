import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'

type LoadingProgress = ReturnType<typeof useProgress.getState>

/**
 * Reads drei's asset loading progress without subscribing to it during render.
 *
 * three fires DefaultLoadingManager.onStart synchronously from inside useLoader, so the
 * store is written while whichever component suspended is still rendering. A component
 * subscribed straight to the store therefore gets updated mid-render of a different
 * component, which React rightly complains about. Mirroring the store into local state on
 * the next frame keeps every one of those updates inside a normal commit instead.
 */
export const useLoadingProgress = (): LoadingProgress => {
   const [progress, setProgress] = useState(useProgress.getState)

   useEffect(() => {
      let frame = 0

      const flush = () => {
         frame = 0
         setProgress(useProgress.getState())
      }

      const unsubscribe = useProgress.subscribe(() => {
         if (!frame) {
            frame = requestAnimationFrame(flush)
         }
      })

      // Loading usually starts before this effect runs, so pick up whatever was missed.
      flush()

      return () => {
         if (frame) {
            cancelAnimationFrame(frame)
         }

         unsubscribe()
      }
   }, [])

   return progress
}
