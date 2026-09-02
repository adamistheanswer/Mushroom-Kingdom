import { WebSocket } from 'ws'
import { getClient, setClient } from '../clients/clientState.js'
import { markClientUpdated } from '../clients/clientUpdates.js'
import { broadcastMessage, encodeMessage, MAX_BUFFERED_AMOUNT } from '../websockets/messages.js'
import { getClientSocketById } from '../websockets/socketRegistry.js'

// Audio itself is peer-to-peer; the server only carries the WebRTC handshake and the flag that
// tells everyone else whose microphone is live.

const SIGNAL_WINDOW_MS = 10000

// One connection trickles roughly 10-30 candidates, and a client signals every other player in
// the room, so the budget has to cover a whole room reconnecting at once - after a page reload,
// say. Under the old 400 the last few peers of a busy room had their offers silently dropped and
// never connected at all.
const MAX_SIGNALS_PER_WINDOW = 1200

// An audio-only offer is a few kilobytes and a candidate a few hundred bytes, so anything larger
// is not signalling - and relaying it would amplify one client's frame across the room.
const MAX_SIGNAL_BYTES = 16 * 1024

/**
 * The id comes from the connection, never the payload, so nobody can flip another player's mic.
 * The flag rides the batched client update as well as its own broadcast, because a player who
 * joins mid-call needs it in the roster and one already here needs it immediately.
 */
export function handleVoiceChatStatus(clientId, message) {
   const voiceChatEnabled = message.payload?.voiceChatEnabled === true
   const clientData = getClient(clientId)

   if (!clientData || clientData.microphone === voiceChatEnabled) {
      return
   }

   clientData.microphone = voiceChatEnabled
   setClient(clientId, clientData)
   markClientUpdated(clientId, 'microphone')
   broadcastMessage('voiceChatStatusUpdate', { clientId, voiceChatEnabled })
}

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
   senderSocket.send(encodeMessage('signalUnavailable', { targetId }))
}

export function handleVoiceSignal(senderId, message, senderSocket, frameBytes = 0) {
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
   targetSocket.send(encodeMessage('signal', { targetId, senderId, signal: payload.signal }))
}
