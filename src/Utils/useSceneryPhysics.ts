import { useEffect, useMemo, useRef, useState } from 'react'
import useSceneryStore from '../State/SceneryStore'
import { modelUrlMap } from './sceneAssetManifest.js'
import { readSceneAsset } from './sceneAssets'
import { isSolidScenery, measureScenery, sceneryCollider } from './sceneryColliders.js'
import { createSceneryPhysics, initializeSceneryPhysics } from './sceneryPhysics.js'
import { PLAYER_COLLISION_RADIUS, PLAYER_WORLD_LIMIT } from '../constants'

export function useSceneryPhysics() {
   const large = useSceneryStore((state) => state.largeScenery)
   const small = useSceneryStore((state) => state.smallScenery)
   const physics = useRef<ReturnType<typeof createSceneryPhysics> | null>(null)
   const [error, setError] = useState<Error | null>(null)
   const shapes = useMemo(() => {
      const bounds = new Map()
      return [...large, ...small]
         .filter((entity) => isSolidScenery(entity[0]))
         .map((entity) => {
            const id = entity[0]
            if (!bounds.has(id)) bounds.set(id, measureScenery(readSceneAsset(modelUrlMap[id]), id < 9))
            return sceneryCollider(entity, bounds.get(id))
         })
         .filter(Boolean)
   }, [large, small])

   useEffect(() => {
      let cancelled = false
      let instance: ReturnType<typeof createSceneryPhysics> | null = null
      initializeSceneryPhysics()
         .then(() => {
            if (cancelled) return
            instance = createSceneryPhysics(shapes, PLAYER_COLLISION_RADIUS, PLAYER_WORLD_LIMIT)
            physics.current = instance
         })
         .catch((cause) => {
            if (!cancelled) setError(cause)
         })
      return () => {
         cancelled = true
         physics.current = null
         instance?.dispose()
      }
   }, [shapes])

   if (error) throw error
   return physics
}
