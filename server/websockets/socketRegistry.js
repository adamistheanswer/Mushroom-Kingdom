// `ws` only exposes its clients as an unindexed Set, but signalling has to reach one player by id
// on every message, so the connection lifecycle keeps this index in step alongside it.
const socketsByClientId = new Map()

export function registerClientSocket(clientId, socket) {
   socketsByClientId.set(clientId, socket)
}

export function unregisterClientSocket(clientId, socket) {
   // A reconnect can claim the id before the old socket finishes closing; only the current one goes.
   if (socketsByClientId.get(clientId) === socket) {
      socketsByClientId.delete(clientId)
   }
}

export function getClientSocketById(clientId) {
   return socketsByClientId.get(clientId)
}

/** Entries are `[clientId, socket]`, which is what every broadcast needs to skip the sender. */
export function getConnectedSockets() {
   return socketsByClientId
}

export function getConnectedSocketCount() {
   return socketsByClientId.size
}
