import React from 'react'
import { sceneAssets } from '../Utils/sceneAssets'
import Loader from './Loader'

export default function SceneAssets({ children }: { children: React.ReactNode }) {
   // Start all requests before suspending, with a fixed denominator from the outset.
   const pending = sceneAssets.start()
   const { active, errors } = sceneAssets.getState()
   if (active) throw pending
   if (errors.length > 0) return <Loader />
   return <>{children}</>
}
