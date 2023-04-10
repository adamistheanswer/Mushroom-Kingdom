import { encode } from '@msgpack/msgpack'
import { getClientSocketById } from './broadcastHandler.js'

export function handleSignalMessage(message) {
   const { targetId } = message.payload

   const targetSocket = getClientSocketById(targetId)
   if (targetSocket) {
      targetSocket.send(encode(message))
   } else {
      console.error(`Target client ${targetId} not found`)
   }
}
