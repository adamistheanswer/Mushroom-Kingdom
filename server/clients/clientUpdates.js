import { broadcastMessage, encodeMessage, sendEncoded } from '../websockets/messages.js'
import { recordClientUpdateTick, startClientUpdateTick } from '../websockets/metrics.js'
import { getConnectedSockets } from '../websockets/socketRegistry.js'
import { performance } from 'node:perf_hooks'
import {
   encodeClientMetadataUpdateBatch,
   encodeClientMotionUpdateBatch,
} from '../../shared/clientUpdateProtocol.js'
import { getClientsAsMap } from './clientState.js'

const ALL_CLIENT_FIELDS = ['position', 'rotation', 'action', 'userName', 'microphone']

// Players move far more often than they rename themselves or touch their microphone, so each
// client accumulates the set of fields that actually changed and the next tick sends only those.
const dirtyClientFields = new Map()
let clientUpdateSequence = 0

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

export function getDirtyClientCount() {
   return dirtyClientFields.size
}

function collectPendingUpdates() {
   const allClients = getClientsAsMap()
   const updates = []

   for (const [clientId, fields] of dirtyClientFields.entries()) {
      const clientData = allClients.get(clientId)

      // The client left between being marked dirty and this tick; the disconnect covers it.
      if (!clientData) {
         continue
      }

      const update = {
         id: clientId,
         seq: ++clientUpdateSequence,
      }

      for (const field of fields) {
         update[field] = clientData[field]
      }

      updates.push(update)
   }

   dirtyClientFields.clear()

   return updates
}

/**
 * Encodes shared motion/metadata batches once per tick. Clients ignore their own entries, and
 * avoiding recipient-specific encodes keeps the tick cost linear in the room size.
 */
export function broadcastClientUpdates() {
   const tickStart = startClientUpdateTick()

   if (dirtyClientFields.size === 0) {
      recordClientUpdateTick(tickStart)
      return
   }

   const collectStart = performance.now()
   const updates = collectPendingUpdates()
   const collectMs = performance.now() - collectStart

   if (updates.length === 0) {
      recordClientUpdateTick(tickStart, { collectMs })
      return
   }

   const sockets = getConnectedSockets()

   if (sockets.size <= 1) {
      recordClientUpdateTick(tickStart, {
         updateCount: updates.length,
         connectedClients: sockets.size,
         collectMs,
      })
      return
   }

   let recipients = 0
   let entriesSent = 0
   let visibleEntriesSent = 0
   let bytesSent = 0
   const encodeStart = performance.now()
   const motionPayload = encodeClientMotionUpdateBatch(updates)
   const metadataPayload = encodeClientMetadataUpdateBatch(updates)
   const encodedMessages = []

   if (motionPayload[1].length > 0) {
      encodedMessages.push({
         entries: motionPayload[1].length,
         message: encodeMessage('clientMotionUpdates', motionPayload),
      })
   }

   if (metadataPayload[1].length > 0) {
      encodedMessages.push({
         entries: metadataPayload[1].length,
         message: encodeMessage('clientMetadataUpdates', metadataPayload),
      })
   }

   const encodeMs = performance.now() - encodeStart

   if (encodedMessages.length === 0) {
      recordClientUpdateTick(tickStart, {
         updateCount: updates.length,
         connectedClients: sockets.size,
         collectMs,
         encodeMs,
      })
      return
   }

   const onlyUpdatedClientId = updates.length === 1 ? updates[0].id : null
   const updatedClientIds = new Set(updates.map((update) => update.id))
   const sendStart = performance.now()

   for (const [clientId, socket] of sockets.entries()) {
      if (onlyUpdatedClientId === clientId) {
         continue
      }

      let sentToSocket = false

      for (const { entries, message } of encodedMessages) {
         if (sendEncoded(socket, message)) {
            sentToSocket = true
            entriesSent += entries
            bytesSent += message.byteLength
         }
      }

      if (sentToSocket) {
         recipients += 1
         visibleEntriesSent += updatedClientIds.has(clientId) ? updates.length - 1 : updates.length
      }
   }

   const sendMs = performance.now() - sendStart

   recordClientUpdateTick(tickStart, {
      updateCount: updates.length,
      recipients,
      entriesSent,
      visibleEntriesSent,
      bytesSent,
      connectedClients: sockets.size,
      collectMs,
      encodeMs,
      sendMs,
   })
}

// Out of band rather than batched, so a departure is never held back by the tick that a client is
// mid-way through rendering.
export function broadcastClientDisconnect(clientId) {
   broadcastMessage('clientDisconnect', clientId)
}
