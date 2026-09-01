import { encode } from '@msgpack/msgpack'
import { getClientSocketById } from './broadcastHandler.js'
import { WebSocket } from 'ws'

const MAX_BUFFERED_AMOUNT = 256 * 1024
const SIGNAL_WINDOW_MS = 10000
const MAX_SIGNALS_PER_WINDOW = 400

// An audio-only offer is a few kilobytes and a candidate a few hundred bytes, so anything larger
// is not signalling - and relaying it would amplify one client's frame across the room.
const MAX_SIGNAL_BYTES = 16 * 1024

function isRateLimited(senderSocket) {
   const now = Date.now()

   if (!senderSocket.signalWindowStart || now - senderSocket.signalWindowStart > SIGNAL_WINDOW_MS) {
      senderSocket.signalWindowStart = now
      senderSocket.signalCount = 0
   }

   senderSocket.signalCount += 1
   return senderSocket.signalCount > MAX_SIGNALS_PER_WINDOW
}

function notifySignalUnavailable(senderSocket, targetId) {
   if (senderSocket?.readyState !== WebSocket.OPEN) {
      return
   }

   // Tells the sender to stop retrying immediately rather than waiting out its own timeouts.
   senderSocket.send(encode({ type: 'signalUnavailable', payload: { targetId } }))
}

export function handleSignalMessage(senderId, message, senderSocket, frameBytes = 0) {
   const payload = message?.payload
   const targetId = payload?.targetId

   if (typeof targetId !== 'string' || targetId.length === 0 || targetId === senderId || !payload?.signal) {
      return
   }

   if (frameBytes > MAX_SIGNAL_BYTES) {
      console.warn(`Discarded an oversized voice signal from ${senderId} (${frameBytes} bytes)`)
      return
   }

   if (isRateLimited(senderSocket)) {
      return
   }

   const targetSocket = getClientSocketById(targetId)

   if (targetSocket?.readyState !== WebSocket.OPEN) {
      notifySignalUnavailable(senderSocket, targetId)
      return
   }

   if (targetSocket.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      // Signals are tiny and dropping one strands the call, so backpressure is logged, not enforced.
      console.warn(`Signalling to ${targetId} is backing up (${targetSocket.bufferedAmount} bytes buffered)`)
   }

   // `senderId` is stamped from the connection rather than trusted from the payload, so a client
   // cannot impersonate another player's signalling.
   targetSocket.send(encode({ type: 'signal', payload: { targetId, senderId, signal: payload.signal } }))
}
