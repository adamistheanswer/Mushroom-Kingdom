import { encode } from '@msgpack/msgpack'
import { WebSocket } from 'ws'
import { recordDroppedOutbound, recordOutboundMessage } from './metrics.js'
import { getConnectedSockets } from './socketRegistry.js'

// A socket this far behind will not catch up on a 50ms update cadence, so its backlog is dropped
// rather than grown until the process runs out of heap.
export const MAX_BUFFERED_AMOUNT = 256 * 1024

/** Every message on the wire is msgpack in this `{ type, payload }` envelope. */
export function encodeMessage(type, payload) {
   return encode({ type, payload })
}

export function sendEncoded(socket, encodedMessage) {
   if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      recordDroppedOutbound()
      return false
   }

   recordOutboundMessage(encodedMessage.byteLength)
   socket.send(encodedMessage)
   return true
}

export function sendMessage(socket, type, payload) {
   return sendEncoded(socket, encodeMessage(type, payload))
}

export function broadcastEncoded(encodedMessage) {
   for (const socket of getConnectedSockets().values()) {
      sendEncoded(socket, encodedMessage)
   }
}

/** Encodes once and reuses the buffer for every recipient. */
export function broadcastMessage(type, payload) {
   broadcastEncoded(encodeMessage(type, payload))
}
