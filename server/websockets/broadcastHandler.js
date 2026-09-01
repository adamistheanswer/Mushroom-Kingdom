import { getAllClients, getClientsAsMap } from '../state/clientState.js'
import { wsServer } from '../../server.js'
import { encode } from '@msgpack/msgpack'
import { WebSocket } from 'ws'
import { performance } from 'node:perf_hooks'

const MAX_BUFFERED_AMOUNT = 256 * 1024
let clientUpdateSequence = 0
const dirtyClientFields = new Map()
const ALL_CLIENT_FIELDS = ['position', 'rotation', 'action', 'userName', 'microphone']
const serverStartedAt = Date.now()
const websocketMetrics = {
   inboundMessages: 0,
   inboundBytes: 0,
   outboundMessages: 0,
   outboundBytes: 0,
   droppedOutbound: 0,
   decodeErrors: 0,
   clientUpdateTicks: 0,
   clientUpdateMsTotal: 0,
   clientUpdateMsMax: 0,
   lastClientUpdateCount: 0,
   lastClientUpdateRecipients: 0,
   lastClientUpdateEntriesSent: 0,
   lastClientUpdateBytes: 0,
   lastAverageVisiblePlayersPerClient: 0,
}
let lastOutboundBytesSampleTime = performance.now()
let lastOutboundBytesSampleTotal = 0
let outboundBytesPerSecond = 0

function getPayloadByteLength(data) {
   if (typeof data === 'string') {
      return Buffer.byteLength(data)
   }

   if (data?.byteLength !== undefined) {
      return data.byteLength
   }

   if (data?.length !== undefined) {
      return data.length
   }

   return 0
}

export function recordInboundWebSocketMessage(data) {
   websocketMetrics.inboundMessages += 1
   websocketMetrics.inboundBytes += getPayloadByteLength(data)
}

export function recordWebSocketDecodeError() {
   websocketMetrics.decodeErrors += 1
}

function recordClientUpdateTick(startTime, updateCount, recipients = 0, entriesSent = 0, bytesSent = 0) {
   const elapsedMs = performance.now() - startTime
   const connectedClients = wsServer.clients.size

   websocketMetrics.clientUpdateTicks += 1
   websocketMetrics.clientUpdateMsTotal += elapsedMs
   websocketMetrics.clientUpdateMsMax = Math.max(websocketMetrics.clientUpdateMsMax, elapsedMs)
   websocketMetrics.lastClientUpdateCount = updateCount
   websocketMetrics.lastClientUpdateRecipients = recipients
   websocketMetrics.lastClientUpdateEntriesSent = entriesSent
   websocketMetrics.lastClientUpdateBytes = bytesSent
   websocketMetrics.lastAverageVisiblePlayersPerClient = connectedClients > 0 ? entriesSent / connectedClients : 0
}

export function markClientUpdatesDirty() {
   for (const clientId of getClientsAsMap().keys()) {
      markClientUpdated(clientId)
   }
}

export function markClientUpdated(clientId, fields = ALL_CLIENT_FIELDS) {
   if (!clientId) {
      return
   }

   const fieldList = Array.isArray(fields) ? fields : [fields]
   const currentFields = dirtyClientFields.get(clientId)

   if (!currentFields) {
      dirtyClientFields.set(clientId, new Set(fieldList))
      return
   }

   for (const field of fieldList) {
      currentFields.add(field)
   }
}

function sendEncodedToClient(client, encodedResponse) {
   if (client.readyState !== WebSocket.OPEN || client.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      websocketMetrics.droppedOutbound += 1
      return false
   }

   websocketMetrics.outboundMessages += 1
   websocketMetrics.outboundBytes += encodedResponse.byteLength
   client.send(encodedResponse)
   return true
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
   const tickStart = performance.now()

   if (dirtyClientFields.size === 0) {
      recordClientUpdateTick(tickStart, 0)
      return
   }

   const allClients = getClientsAsMap()
   const serverTime = Date.now()
   const updates = []

   for (const [clientId, fields] of dirtyClientFields.entries()) {
      const clientData = allClients.get(clientId)
      if (!clientData) {
         continue
      }

      const update = {
         id: clientId,
         seq: ++clientUpdateSequence,
         serverTime,
      }

      for (const field of fields) {
         update[field] = clientData[field]
      }

      updates.push(update)
   }

   dirtyClientFields.clear()

   if (updates.length === 0) {
      recordClientUpdateTick(tickStart, 0)
      return
   }

   let recipients = 0
   let entriesSent = 0
   let bytesSent = 0

   wsServer.clients.forEach((client) => {
      const payload = updates.filter((update) => update.id !== client.clientId)

      if (payload.length === 0) {
         return
      }

      const encodedResponse = encode({
         type: 'clientUpdates',
         payload,
      })

      if (sendEncodedToClient(client, encodedResponse)) {
         recipients += 1
         entriesSent += payload.length
         bytesSent += encodedResponse.byteLength
      }
   })

   recordClientUpdateTick(tickStart, updates.length, recipients, entriesSent, bytesSent)
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

export function getWebSocketDebugStats() {
   const now = performance.now()
   const secondsSinceLastSample = Math.max(0.001, (now - lastOutboundBytesSampleTime) / 1000)

   outboundBytesPerSecond = (websocketMetrics.outboundBytes - lastOutboundBytesSampleTotal) / secondsSinceLastSample
   lastOutboundBytesSampleTime = now
   lastOutboundBytesSampleTotal = websocketMetrics.outboundBytes

   return {
      connectedClients: wsServer.clients.size,
      inboundMessages: websocketMetrics.inboundMessages,
      inboundBytes: websocketMetrics.inboundBytes,
      outboundMessages: websocketMetrics.outboundMessages,
      outboundBytes: websocketMetrics.outboundBytes,
      outboundBytesPerSecond,
      droppedOutbound: websocketMetrics.droppedOutbound,
      decodeErrors: websocketMetrics.decodeErrors,
      clientUpdateTicks: websocketMetrics.clientUpdateTicks,
      clientUpdateMsAvg:
         websocketMetrics.clientUpdateTicks > 0
            ? websocketMetrics.clientUpdateMsTotal / websocketMetrics.clientUpdateTicks
            : 0,
      clientUpdateMsMax: websocketMetrics.clientUpdateMsMax,
      lastClientUpdateCount: websocketMetrics.lastClientUpdateCount,
      lastClientUpdateRecipients: websocketMetrics.lastClientUpdateRecipients,
      lastClientUpdateEntriesSent: websocketMetrics.lastClientUpdateEntriesSent,
      lastClientUpdateBytes: websocketMetrics.lastClientUpdateBytes,
      lastAverageVisiblePlayersPerClient: websocketMetrics.lastAverageVisiblePlayersPerClient,
      dirtyClients: dirtyClientFields.size,
      uptimeSeconds: Math.round((Date.now() - serverStartedAt) / 1000),
   }
}

export function broadcastWebSocketDebugStats() {
   const response = {
      type: 'debugServerStats',
      payload: getWebSocketDebugStats(),
   }
   const encodedResponse = encode(response)

   wsServer.clients.forEach((client) => {
      if (client.debugSubscribed) {
         sendEncodedToClient(client, encodedResponse)
      }
   })
}
