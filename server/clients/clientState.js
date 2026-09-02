// "Client" rather than "player" throughout: it is the vocabulary of the wire protocol
// (`clientId`, `activeClients`, `clientUpdates`) and of the frontend that reads it.
const clients = new Map()

export function setClient(clientId, data) {
   clients.set(clientId, data)
}

export function getClient(clientId) {
   return clients.get(clientId)
}

export function removeClient(clientId) {
   clients.delete(clientId)
}

export function getClientCount() {
   return clients.size
}

/** A plain object for the wire; msgpack encodes a Map into something the client cannot read back. */
export function getAllClients() {
   return Object.fromEntries(clients)
}

/** The live Map, for the hot paths that would otherwise copy every client on every tick. */
export function getClientsAsMap() {
   return clients
}
