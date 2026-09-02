import { clearChatHistory, getChatMessages, markChatMessagesDisconnected } from '../chat/chat.js'
import { clearClientMovementQueue } from '../clients/clientMessages.js'
import { getAllClients, getClientCount, removeClient, setClient } from '../clients/clientState.js'
import { broadcastClientDisconnect, markClientUpdated } from '../clients/clientUpdates.js'
import { uid } from '../utils/uid.js'
import { clearWorld, ensureWorldGenerated, getLargeScenery, getSmallScenery } from '../world/world.js'
import { routeClientMessage } from './messageRouter.js'
import { encodeMessage, sendEncoded, sendMessage } from './messages.js'
import { registerClientSocket, unregisterClientSocket } from './socketRegistry.js'

function createSpawnState() {
   return {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      action: '3',
      userName: '',
      microphone: false,
   }
}

let encodedSceneryCache = null

function getEncodedSceneryFrames() {
   const largeScenery = getLargeScenery()
   const smallScenery = getSmallScenery()

   // clearWorld() replaces both arrays, so identity is enough to expire stale encoded frames.
   if (
      !encodedSceneryCache ||
      encodedSceneryCache.largeScenery !== largeScenery ||
      encodedSceneryCache.smallScenery !== smallScenery
   ) {
      encodedSceneryCache = {
         largeScenery,
         smallScenery,
         largeFrame: encodeMessage('largeScenery', largeScenery),
         smallFrame: encodeMessage('smallScenery', smallScenery),
      }
   }

   return encodedSceneryCache
}

/**
 * Everything a client needs before it can render the world. The id goes first so the roster that
 * follows can be read with one entry already known to be the player's own.
 */
function sendJoinSnapshot(socket, clientId) {
   const sceneryFrames = getEncodedSceneryFrames()

   sendMessage(socket, 'clientId', clientId)
   sendMessage(socket, 'activeClients', getAllClients())
   sendEncoded(socket, sceneryFrames.largeFrame)
   sendEncoded(socket, sceneryFrames.smallFrame)
   sendMessage(socket, 'chatMessages', getChatMessages())
}

export function handleConnection(socket) {
   const clientId = uid()

   registerClientSocket(clientId, socket)
   setClient(clientId, createSpawnState())
   markClientUpdated(clientId)
   ensureWorldGenerated()

   console.log(`User ${clientId} connected - ${getClientCount()} active users`)

   sendJoinSnapshot(socket, clientId)

   socket.on('message', (data) => routeClientMessage(clientId, socket, data))

   socket.on('error', (error) => {
      console.warn(`Socket error for ${clientId}`, error?.message ?? error)
   })

   socket.on('close', () => {
      handleDisconnection(clientId, socket)
   })
}

function handleDisconnection(clientId, socket) {
   unregisterClientSocket(clientId, socket)
   clearClientMovementQueue(clientId)
   markChatMessagesDisconnected(clientId)
   removeClient(clientId)

   console.log(`User ${clientId} disconnected - ${getClientCount()} active users`)

   // Nothing outlives an empty room; the next arrival gets a freshly generated world and a clean log.
   if (getClientCount() === 0) {
      clearWorld()
      clearChatHistory()
   }

   broadcastClientDisconnect(clientId)
}
