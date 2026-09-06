export const DAY_DURATION_MS = 5 * 60 * 1000
export const NIGHT_DURATION_MS = 5 * 60 * 1000
export const CYCLE_DURATION_MS = DAY_DURATION_MS + NIGHT_DURATION_MS
// A fixed epoch preserves the world's time across empty rooms and server restarts.
export const CYCLE_EPOCH_MS = Date.UTC(2026, 0, 1)
export const MAX_ALTITUDE_DEGREES = 25

export function smoothstep(low, high, value) {
   const t = Math.max(0, Math.min(1, (value - low) / (high - low)))
   return t * t * (3 - 2 * t)
}

export function getDayNightState(serverTimeMs) {
   const phase =
      ((((serverTimeMs - CYCLE_EPOCH_MS) % CYCLE_DURATION_MS) + CYCLE_DURATION_MS) % CYCLE_DURATION_MS) /
      CYCLE_DURATION_MS
   const angle = phase * Math.PI * 2
   const height = Math.sin(angle)
   // Each crossing blends for roughly 45 seconds, including blue twilight below the horizon.
   const daylight = smoothstep(-0.23, 0.23, height)
   const twilight = 1 - smoothstep(0, 0.38, Math.abs(height))
   const direction = (a) => {
      const x = Math.cos(a)
      const z = -0.8
      const y = Math.sin(a) * 0.8 * Math.tan((MAX_ALTITUDE_DEGREES * Math.PI) / 180)
      const length = Math.hypot(x, y, z)
      return [x / length, y / length, z / length]
   }
   return {
      phase,
      daylight,
      twilight,
      sunDirection: direction(angle),
      moonDirection: direction(angle + Math.PI),
      sunVisibility: smoothstep(-0.06, 0.08, height),
      moonVisibility: smoothstep(-0.06, 0.08, -height),
      primaryIsSun: height >= 0,
      // Hide the shadow handoff at the horizon in diffuse twilight.
      directStrength: smoothstep(0, 0.18, Math.abs(height)),
   }
}
