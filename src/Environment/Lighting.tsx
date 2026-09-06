import React, { useEffect, useMemo, useRef } from 'react'
import { extend, useFrame } from '@react-three/fiber'
import { AmbientLight, Color, DirectionalLight, HemisphereLight, DirectionalLightHelper, Vector3 } from 'three'
import { environment, updateEnvironment } from './dayNightState'
import { FOG_FAR, SHADOW_MAP_SIZE } from './sceneQuality'

extend({
   AmbientLight,
   DirectionalLight,
   HemisphereLight,
   DirectionalLightHelper,
})

// Where the moon sits relative to whatever it is lighting.
const LIGHT_OFFSET = new Vector3()
const LIGHT_DISTANCE = 800

// A little slack past the fog wall, so rounding and terrain relief can never expose the seam.
const SHADOW_FOG_MARGIN = 10

// Mood dials. Cool, desaturated key light and a dim blue fill read as moonlight; push them back
// towards white to undo the night-time grade.
const MOONLIGHT_COLOR = 0xc2d4f7
const SKY_FILL_COLOR = 0xb7c7ed
const GROUND_BOUNCE_COLOR = 0x687985
const NIGHT_FILL_COLOR = 0x6d82b5
const DAY_KEY = new Color('#fff2d5')
const DUSK_KEY = new Color('#ffaf70')
const NIGHT_KEY = new Color(MOONLIGHT_COLOR)
const DAY_FILL = new Color('#c7e3ff')
const NIGHT_SKY = new Color(SKY_FILL_COLOR)
const DAY_BOUNCE = new Color('#82946a')
const NIGHT_BOUNCE = new Color(GROUND_BOUNCE_COLOR)

// Shadow camera basis, matching how three builds it from lookAt with a world up of +Y.
const WORLD_UP = new Vector3(0, 1, 0)
const LIGHT_DIR = new Vector3()
const SHADOW_RIGHT = new Vector3().crossVectors(WORLD_UP, LIGHT_DIR).normalize()
const SHADOW_UP = new Vector3().crossVectors(LIGHT_DIR, SHADOW_RIGHT).normalize()

export default function Lighting() {
   const legacyLightingMultiplier = Math.PI

   const sunRef = useRef<DirectionalLight>(null)
   const hemisphereRef = useRef<HemisphereLight>(null)
   const ambientRef = useRef<AmbientLight>(null)
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
      updateEnvironment()
      const sun = sunRef.current
      if (!sun) return
      const { daylight, twilight, primaryIsSun, directStrength } = environment
      LIGHT_DIR.copy(environment.primaryDirection)
      LIGHT_OFFSET.copy(LIGHT_DIR).multiplyScalar(LIGHT_DISTANCE)
      SHADOW_RIGHT.crossVectors(WORLD_UP, LIGHT_DIR).normalize()
      SHADOW_UP.crossVectors(LIGHT_DIR, SHADOW_RIGHT).normalize()
      sun.color.copy(primaryIsSun ? DAY_KEY : NIGHT_KEY)
      if (primaryIsSun) sun.color.lerp(DUSK_KEY, twilight)
      sun.intensity = (primaryIsSun ? 2.8 : 0.4 * Math.PI) * directStrength
      sun.shadow.intensity = directStrength
      if (hemisphereRef.current) {
         hemisphereRef.current.color.copy(NIGHT_SKY).lerp(DAY_FILL, daylight)
         hemisphereRef.current.groundColor.copy(NIGHT_BOUNCE).lerp(DAY_BOUNCE, daylight)
         hemisphereRef.current.intensity = Math.PI * (0.4 + daylight * 0.3)
      }
      if (ambientRef.current) ambientRef.current.intensity = Math.PI * (0.2 + daylight * 0.08)
      if (state.scene.fog) state.scene.fog.color.copy(environment.fog)
      if (state.scene.background instanceof Color) state.scene.background.copy(environment.horizon)

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
   }, -1)

   return (
      <>
         <hemisphereLight
            ref={hemisphereRef}
            args={[SKY_FILL_COLOR, GROUND_BOUNCE_COLOR, 0.4 * legacyLightingMultiplier]}
            position={[0, 600, 0]}
         />
         <directionalLight
            ref={sunRef}
            args={[MOONLIGHT_COLOR, 0.4 * legacyLightingMultiplier]}
            shadow-mapSize-width={SHADOW_MAP_SIZE}
            shadow-mapSize-height={SHADOW_MAP_SIZE}
            castShadow
         />

         <ambientLight ref={ambientRef} color={NIGHT_FILL_COLOR} intensity={0.2 * legacyLightingMultiplier} />
      </>
   )
}
