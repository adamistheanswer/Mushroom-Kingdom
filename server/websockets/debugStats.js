import { getDirtyClientCount } from '../clients/clientUpdates.js'
import { encodeMessage, sendEncoded } from './messages.js'
import { getWebSocketMetrics } from './metrics.js'
import { getConnectedSocketCount, getConnectedSockets } from './socketRegistry.js'

// Kept out of metrics.js so that the raw counters stay a leaf module: messages.js records into
// them, and this composes the counters with state owned by modules that sit on top of messages.js.

/** The shape here is the wire contract with the client's debug overlay. */
export function getWebSocketDebugStats() {
   return {
      connectedClients: getConnectedSocketCount(),
      dirtyClients: getDirtyClientCount(),
      ...getWebSocketMetrics(),
   }
}

export function broadcastWebSocketDebugStats() {
   const encodedMessage = encodeMessage('debugServerStats', getWebSocketDebugStats())

   for (const socket of getConnectedSockets().values()) {
      if (socket.debugSubscribed) {
         sendEncoded(socket, encodedMessage)
      }
   }
}
