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
   const allClients = {}

   for (const [clientId, clientData] of clients.entries()) {
      allClients[clientId] = clientData
   }

   return allClients
}

export function getClientsAsMap() {
   return clients
}
