import { useEffect, useState } from 'react'
import { sceneAssets } from './sceneAssets'

type LoadingProgress = ReturnType<typeof sceneAssets.getState>

// Batch updates can happen during Suspense rendering; mirror them on the next frame.
export const useLoadingProgress = (): LoadingProgress => {
   const [progress, setProgress] = useState(sceneAssets.getState)

   useEffect(() => {
      let frame = 0

      const flush = () => {
         frame = 0
         setProgress(sceneAssets.getState())
      }

      const unsubscribe = sceneAssets.subscribe(() => {
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
