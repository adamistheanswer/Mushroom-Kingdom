import { decode } from '@msgpack/msgpack'
import { performance } from 'node:perf_hooks'
import { handleChatMessage } from '../chat/chat.js'
import { handleClientAction, handleClientMovement, handleClientUserName } from '../clients/clientMessages.js'
import { getPayloadByteLength } from '../utils/payload.js'
import { handleVoiceChatStatus, handleVoiceSignal } from '../voice/voice.js'
import { recordDecodeError, recordDecodeTiming, recordInboundMessage } from './metrics.js'

const STATE_SET_USERNAME = 'state_set_username'
const STATE_SET_CLIENT_ACTION = 'state_set_client_action'
const STATE_SET_CLIENT_MOVEMENT = 'move'
const STATE_SET_VOICE_CHAT_STATUS = 'state_set_client_voice_chat_status'
const HEARTBEAT = 'heartbeat'
const CHAT = 'chat'
const SIGNAL = 'signal'
const DEBUG_SUBSCRIBE = 'debug_subscribe'

// The one place that knows every message type, and so the one place to look to find the feature
// behind a name on the wire. A Map, not an object, because the key comes straight off that wire
// and must not be able to reach anything on Object.prototype. Every handler takes the same context
// so this stays a plain lookup.
const messageHandlers = new Map([
   [STATE_SET_CLIENT_MOVEMENT, ({ clientId, message }) => handleClientMovement(clientId, message)],
   [STATE_SET_CLIENT_ACTION, ({ clientId, message }) => handleClientAction(clientId, message)],
   [STATE_SET_USERNAME, ({ clientId, message }) => handleClientUserName(clientId, message)],
   [CHAT, ({ clientId, message }) => handleChatMessage(clientId, message)],
   [STATE_SET_VOICE_CHAT_STATUS, ({ clientId, message }) => handleVoiceChatStatus(clientId, message)],
   [SIGNAL, ({ clientId, message, socket, frameBytes }) => handleVoiceSignal(clientId, message, socket, frameBytes)],
   [
      DEBUG_SUBSCRIBE,
      ({ socket, message }) => {
         // The stats describe the whole room, so they stay unavailable in production whoever asks.
         socket.debugSubscribed =
            process.env.NODE_ENV !== 'production' &&
            message.payload?.role === 'debugClient' &&
            Boolean(message.payload?.enabled)
      },
   ],
   // Sent only to keep intermediaries from idling the connection out; there is nothing to do with it.
   [HEARTBEAT, () => {}],
])

function decodeClientMessage(data, clientId) {
   const decodeStart = performance.now()

   try {
      return decode(data)
   } catch (error) {
      recordDecodeError()
      // A malformed frame must not take the connection - or the process - down with it.
      console.warn(`Discarded an undecodable message from ${clientId}`)
      return null
   } finally {
      recordDecodeTiming(performance.now() - decodeStart)
   }
}

export function routeClientMessage(clientId, socket, data) {
   // Measured on the raw frame so an oversized signal costs nothing to reject.
   const frameBytes = getPayloadByteLength(data)
   recordInboundMessage(frameBytes)

   const message = decodeClientMessage(data, clientId)

   if (!message || typeof message.type !== 'string') {
      return
   }

   const handler = messageHandlers.get(message.type)

   if (!handler) {
      return
   }

   try {
      handler({ clientId, socket, message, frameBytes })
   } catch (error) {
      console.error(`Failed to handle a ${message.type} message from ${clientId}`, error)
   }
}
