import { getAllClients, getClientsAsMap } from '../state/clientState.js'
import { wsServer } from '../../server.js'
import { encode } from '@msgpack/msgpack'
import { WebSocket } from 'ws'

const MAX_BUFFERED_AMOUNT = 256 * 1024
let clientUpdateSequence = 0
const dirtyClientIds = new Set()

export function markClientUpdatesDirty() {
   for (const clientId of getClientsAsMap().keys()) {
      dirtyClientIds.add(clientId)
   }
}

export function markClientUpdated(clientId) {
   if (clientId) {
      dirtyClientIds.add(clientId)
   }
}

function sendEncodedToClient(client, encodedResponse) {
   if (client.readyState !== WebSocket.OPEN || client.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      return
   }

   client.send(encodedResponse)
}

function broadcastEncoded(encodedResponse) {
   wsServer.clients.forEach((client) => {
      sendEncodedToClient(client, encodedResponse)
   })
}

export function broardcastClientDisconnect(clientId) {
   const disconnectMessage = {
      type: 'clientDisconnect',
      payload: clientId,
   }

   const encodedResponse = encode(disconnectMessage)
   broadcastEncoded(encodedResponse)
}

export function broadcastClientUpdates() {
   if (dirtyClientIds.size === 0) {
      return
   }

   const allClients = getClientsAsMap()
   const serverTime = Date.now()
   const updates = []

   for (const clientId of dirtyClientIds) {
      const clientData = allClients.get(clientId)
      if (!clientData) {
         continue
      }

      updates.push({
         id: clientId,
         position: clientData.position,
         rotation: clientData.rotation,
         action: clientData.action,
         userName: clientData.userName,
         microphone: clientData.microphone,
         seq: ++clientUpdateSequence,
         serverTime,
      })
   }

   dirtyClientIds.clear()

   if (updates.length === 0) {
      return
   }

   const response = {
      type: 'clientUpdates',
      payload: updates,
   }
   const encodedResponse = encode(response)
   broadcastEncoded(encodedResponse)
}

export function broadcastActiveClients(client) {
   const allClients = getAllClients()

   const response = {
      type: 'activeClients',
      payload: allClients,
   }
   const encodedResponse = encode(response)

   if (client) {
      sendEncodedToClient(client, encodedResponse)
      return
   }

   broadcastEncoded(encodedResponse)
}

export function broadcastClientVoiceChatStatusUpdate(clientId, voiceChatEnabled) {
   const response = {
      type: 'voiceChatStatusUpdate',
      payload: { clientId, voiceChatEnabled },
   }
   const encodedResponse = encode(response)
   broadcastEncoded(encodedResponse)
}

export function broadcastChatMessage(chatMessage) {
   const response = {
      type: 'chatMessage',
      payload: chatMessage,
   }
   const encodedResponse = encode(response)
   broadcastEncoded(encodedResponse)
}

export function getClientSocketById(clientId) {
   return [...wsServer.clients].find((client) => clientId === client.clientId)
}
