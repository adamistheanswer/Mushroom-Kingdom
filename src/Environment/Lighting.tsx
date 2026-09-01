import React, { useEffect, useMemo, useRef } from 'react'
import { extend, useFrame } from '@react-three/fiber'
import { AmbientLight, DirectionalLight, HemisphereLight, DirectionalLightHelper, Vector3 } from 'three'
import { MOONLIGHT_OFFSET } from '../constants'
import { FOG_FAR, SHADOW_MAP_SIZE } from './sceneQuality'

extend({
   AmbientLight,
   DirectionalLight,
   HemisphereLight,
   DirectionalLightHelper,
})

// Where the moon sits relative to whatever it is lighting.
const LIGHT_OFFSET = new Vector3(...MOONLIGHT_OFFSET)
const LIGHT_DISTANCE = LIGHT_OFFSET.length()

// A little slack past the fog wall, so rounding and terrain relief can never expose the seam.
const SHADOW_FOG_MARGIN = 10

// Mood dials. Cool, desaturated key light and a dim blue fill read as moonlight; push them back
// towards white to undo the night-time grade.
const MOONLIGHT_COLOR = 0xc2d4f7
const NIGHT_FILL_COLOR = 0x6d82b5

// Shadow camera basis, matching how three builds it from lookAt with a world up of +Y.
const WORLD_UP = new Vector3(0, 1, 0)
const LIGHT_DIR = LIGHT_OFFSET.clone().normalize()
const SHADOW_RIGHT = new Vector3().crossVectors(WORLD_UP, LIGHT_DIR).normalize()
const SHADOW_UP = new Vector3().crossVectors(LIGHT_DIR, SHADOW_RIGHT).normalize()

export default function Lighting() {
   const legacyLightingMultiplier = Math.PI

   const sunRef = useRef<DirectionalLight>(null)
   const focus = useMemo(() => new Vector3(), [])
   const shadowRadius = useRef(0)

   useEffect(() => {
      const sun = sunRef.current
      if (!sun) return

      // Offsetting along the surface normal scales with world units rather than depth range,
      // which holds up much better than depth bias alone on the low-poly scenery.
      sun.shadow.normalBias = 0.1
      sun.shadow.bias = -0.00005
   }, [])

   useFrame((state) => {
      const sun = sunRef.current
      if (!sun) return

      const orbitTarget = (state.controls as { target?: Vector3 } | null)?.target
      focus.copy(orbitTarget ?? state.camera.position)

      // Shadows are cut off in a circle around the player, but fog is measured from the camera,
      // which sits back on its orbit. Sizing to FOG_FAR alone would leave the near edge of that
      // circle short of the fog wall and put a visible seam on the ground, so the orbit distance
      // has to be added on. Zoom is disabled, so in practice this settles on frame one.
      const requiredRadius = FOG_FAR + state.camera.position.distanceTo(focus) + SHADOW_FOG_MARGIN

      if (Math.abs(requiredRadius - shadowRadius.current) > 1) {
         shadowRadius.current = requiredRadius

         const camera = sun.shadow.camera
         camera.left = -requiredRadius
         camera.right = requiredRadius
         camera.top = requiredRadius
         camera.bottom = -requiredRadius
         camera.near = 50
         camera.far = LIGHT_DISTANCE + requiredRadius * 2
         camera.updateProjectionMatrix()
      }

      focus.y = 0

      // Snap the frustum to whole shadow texels, otherwise the edges crawl and shimmer as the
      // light slides along with the player.
      const texel = (shadowRadius.current * 2) / SHADOW_MAP_SIZE
      const right = Math.round(focus.dot(SHADOW_RIGHT) / texel) * texel
      const up = Math.round(focus.dot(SHADOW_UP) / texel) * texel
      const depth = focus.dot(LIGHT_DIR)

      focus
         .set(0, 0, 0)
         .addScaledVector(SHADOW_RIGHT, right)
         .addScaledVector(SHADOW_UP, up)
         .addScaledVector(LIGHT_DIR, depth)

      sun.target.position.copy(focus)
      sun.target.updateMatrixWorld()
      sun.position.copy(focus).add(LIGHT_OFFSET)
   })

   return (
      <>
         <hemisphereLight
            args={[0xffffff, 0xfffffff, 0.2 * legacyLightingMultiplier]}
            color={[0, 0, 0]}
            groundColor={[0, 2, 1]}
            position={[0, 600, 0]}
         />
         <directionalLight
            ref={sunRef}
            args={[MOONLIGHT_COLOR, 0.4 * legacyLightingMultiplier]}
            position={MOONLIGHT_OFFSET}
            shadow-mapSize-width={SHADOW_MAP_SIZE}
            shadow-mapSize-height={SHADOW_MAP_SIZE}
            castShadow
         />

         <ambientLight color={NIGHT_FILL_COLOR} intensity={0.2 * legacyLightingMultiplier} />
      </>
   )
}
