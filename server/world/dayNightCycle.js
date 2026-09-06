import { CYCLE_DURATION_MS, CYCLE_EPOCH_MS } from '../../shared/dayNightCycle.js'

export function getWorldTime(clientSentAt) {
   return { serverTimeMs: Date.now(), cycleDurationMs: CYCLE_DURATION_MS, epochMs: CYCLE_EPOCH_MS, clientSentAt }
}
