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

export function getAllClients() {
   return Array.from(clients.entries()).reduce((acc, [key, value]) => {
      return { ...acc, [key]: value }
   }, {})
}

export function getClientsAsMap() {
   return clients
}
