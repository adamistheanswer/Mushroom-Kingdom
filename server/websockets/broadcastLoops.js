import { broadcastClientUpdates } from '../clients/clientUpdates.js'
import { broadcastWebSocketDebugStats } from './debugStats.js'

const CLIENT_UPDATE_INTERVAL_MS = 50
const DEBUG_STATS_INTERVAL_MS = 1000

let clientUpdatesInterval = null
let debugStatsInterval = null

/**
 * Movement is batched onto a fixed 20Hz tick rather than relayed as it arrives, so a room of busy
 * players costs a predictable number of frames per second instead of one per input.
 */
export function startBroadcastLoops({
   clientUpdateMs = CLIENT_UPDATE_INTERVAL_MS,
   debugStatsMs = DEBUG_STATS_INTERVAL_MS,
} = {}) {
   stopBroadcastLoops()

   clientUpdatesInterval = setInterval(broadcastClientUpdates, clientUpdateMs)
   debugStatsInterval = setInterval(broadcastWebSocketDebugStats, debugStatsMs)
}

export function stopBroadcastLoops() {
   clearInterval(clientUpdatesInterval)
   clearInterval(debugStatsInterval)

   clientUpdatesInterval = null
   debugStatsInterval = null
}
