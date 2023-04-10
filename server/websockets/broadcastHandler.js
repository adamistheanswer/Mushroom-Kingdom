import { getAllClients } from '../state/clientState.js'
import { wsServer } from '../../server.js'
import { encode } from '@msgpack/msgpack'

export function broardcastClientDisconnect(clientId) {
   const disconnectMessage = {
      type: 'clientDisconnect',
      payload: clientId,
   }

   const encodedResponse = encode(disconnectMessage)
   wsServer.clients.forEach((client) => {
      client.send(encodedResponse)
   })
}

export function broadcastClientUpdates() {
   const response = {
      type: 'clientUpdates',
      payload: getAllClients(),
   }
   const encodedResponse = encode(response)
   wsServer.clients.forEach((client) => {
      client.send(encodedResponse)
   })
}

export function broadcastActiveClients() {
   const allClients = getAllClients()

   const response = {
      type: 'activeClients',
      payload: allClients,
   }
   const encodedResponse = encode(response)
   wsServer.clients.forEach((client) => {
      client.send(encodedResponse)
   })
}

export function broadcastClientVoiceChatStatusUpdate(clientId, voiceChatEnabled) {
   const response = {
      type: 'voiceChatStatusUpdate',
      payload: { clientId, voiceChatEnabled },
   }
   const encodedResponse = encode(response)
   wsServer.clients.forEach((client) => {
      client.send(encodedResponse)
   })
}

export function getClientSocketById(clientId) {
   return [...wsServer.clients].find((client) => clientId === client.clientId)
}
