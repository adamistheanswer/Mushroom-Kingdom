import { Color, Vector2, Vector3 } from 'three'
import { getDayNightState } from '../../shared/dayNightCycle.js'

let anchorTime = 0
let anchorLocal = 0
let synchronized = false

export function synchronizeWorldTime(payload: { serverTimeMs: number; clientSentAt?: number }) {
   if (!Number.isFinite(payload?.serverTimeMs)) return
   const now = performance.now()
   const rtt = typeof payload.clientSentAt === 'number' ? now - payload.clientSentAt : 0
   if (rtt < 0 || rtt > 10000) return
   anchorTime = payload.serverTimeMs + rtt / 2
   anchorLocal = now
   synchronized = true
}

const night = new Color('#0a1226')
const day = new Color('#428ed0')
const nightHorizon = new Color('#01030a')
const dayHorizon = new Color('#b0d4e2')
const dusk = new Color('#d07859')
const nightFog = new Color('#050c16')
const dayFog = new Color('#a1c2c9')
export const environment = {
   ...getDayNightState(0),
   primaryDirection: new Vector3(),
   zenith: new Color(),
   horizon: new Color(),
   fog: new Color(),
   grassTint: new Color(),
   grassFog: new Color(),
   directUniform: new Vector3(),
   cloudDrift: new Vector2(),
}

export function updateEnvironment() {
   // Keep the original night mood until the server supplies the clock.
   const time = synchronized ? anchorTime + performance.now() - anchorLocal : 450000
   Object.assign(environment, getDayNightState(time))
   // A seamless one-hour drift uses server time, so joining players see the same clouds.
   // Bound the shader coordinates to preserve floating-point detail after long server uptimes.
   const cloudAngle = ((time % 3600000) / 3600000) * Math.PI * 2
   environment.cloudDrift.set(Math.cos(cloudAngle) * 6, Math.sin(cloudAngle) * 6)
   const { daylight, twilight, primaryIsSun, sunDirection, moonDirection } = environment
   environment.primaryDirection.fromArray(primaryIsSun ? sunDirection : moonDirection)
   environment.zenith.copy(night).lerp(day, daylight)
   environment.horizon
      .copy(nightHorizon)
      .lerp(dayHorizon, daylight)
      .lerp(dusk, twilight * 0.65)
   environment.fog
      .copy(nightFog)
      .lerp(dayFog, daylight)
      .lerp(dusk, twilight * 0.28)
   environment.grassFog.copy(environment.fog).convertLinearToSRGB()
   environment.directUniform.setScalar(environment.directStrength)
   environment.grassTint.setRGB(1 + daylight * 1.1, 1 + daylight * 1.05, 1 + daylight * 0.65)
}
updateEnvironment()
