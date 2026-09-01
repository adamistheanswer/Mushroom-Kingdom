import { setClient, removeClient, getClientsAsMap } from '../state/clientState.js'
import { getLargeScenery, setLargeScenery, getSmallScenery, setSmallScenery } from '../state/sceneryState.js'
import { clearChatMessages, markChatMessagesDisconnected } from '../state/chatState.js'
import { decode } from '@msgpack/msgpack'
import { uid } from '../utils/utils.js'
import { generateLargeScenery, generateSmallScenery } from '../utils/generateScenery.js'
import { sendChatMessages, sendClientId, sendLargeScenery, sendSmallScenery } from './InitialisationHander.js'
import {
   broadcastActiveClients,
   broardcastClientDisconnect,
   markClientUpdated,
   broadcastClientUpdates,
   broadcastWebSocketDebugStats,
   recordInboundWebSocketMessage,
   recordWebSocketDecodeError,
} from './broadcastHandler.js'
import {
   handleStateSetPlayerAction,
   handleStateSetPlayerMovement,
   handleStateSetVoiceChatStatus,
   handleStateSetUserName,
   handleChatMessage,
} from './stateHandler.js'
import { handleSignalMessage } from './signalHandler.js'

const STATE_SET_USERNAME = 'state_set_username'
const STATE_SET_CLIENT_ACTION = 'state_set_client_action'
const STATE_SET_CLIENT_MOVEMENT = 'move'
const STATE_SET_VOICE_CHAT_STATUS = 'state_set_client_voice_chat_status'
const HEARTBEAT = 'heartbeat'
const CHAT = 'chat'
const DEBUG_SUBSCRIBE = 'debug_subscribe'

export function handleConnection(socket) {
   const clientId = uid()
   socket.clientId = clientId
   console.log(`User ${clientId} connected - ${getClientsAsMap().size + 1} active users`)

   setClient(clientId, {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      action: '3',
      userName: '',
      microphone: false,
   })
   markClientUpdated(clientId)

   sendClientId(socket, clientId)
   broadcastActiveClients(socket)

   if (getLargeScenery().length === 0) {
      setLargeScenery(generateLargeScenery())
   }

   if (getSmallScenery().length === 0) {
      setSmallScenery(generateSmallScenery())
   }

   sendLargeScenery(socket)
   sendSmallScenery(socket)
   sendChatMessages(socket)

   socket.on('message', (data) => {
      recordInboundWebSocketMessage(data)

      let message

      try {
         message = decode(data)
      } catch (error) {
         recordWebSocketDecodeError()
         console.error(`Unable to decode message from ${clientId}:`, error)
         return
      }

      switch (message.type) {
         case STATE_SET_USERNAME:
            handleStateSetUserName(clientId, message)
            break
         case STATE_SET_CLIENT_MOVEMENT:
            handleStateSetPlayerMovement(clientId, message)
            break
         case STATE_SET_CLIENT_ACTION:
            handleStateSetPlayerAction(clientId, message)
            break
         case STATE_SET_VOICE_CHAT_STATUS:
            handleStateSetVoiceChatStatus(message)
            break
         case 'signal':
            handleSignalMessage(message)
            break
         case CHAT:
            handleChatMessage(clientId, message)
            break
         case HEARTBEAT:
            break
         case DEBUG_SUBSCRIBE:
            socket.debugSubscribed = process.env.NODE_ENV !== 'production' && Boolean(message.payload?.enabled)
            break
      }
   })

   handleDisconnection(socket, clientId)
}

function handleDisconnection(socket, clientId) {
   socket.on('close', () => {
      console.log(`User ${clientId} disconnected - ${getClientsAsMap().size - 1} active users`)

      if (getClientsAsMap().size === 1) {
         setLargeScenery([])
         setSmallScenery([])
         clearChatMessages()
      }

      markChatMessagesDisconnected(clientId)
      removeClient(clientId)
      broardcastClientDisconnect(clientId)
   })
}

let clientUpdatesInterval = null
let debugStatsInterval = null

export function startSendingClientUpdates(intervalMs = 50) {
   if (clientUpdatesInterval) {
      stopSendingClientUpdates()
   }
   clientUpdatesInterval = setInterval(broadcastClientUpdates, intervalMs)
}

export function startSendingDebugStats(intervalMs = 1000) {
   if (debugStatsInterval) {
      stopSendingDebugStats()
   }
   debugStatsInterval = setInterval(broadcastWebSocketDebugStats, intervalMs)
}

function stopSendingClientUpdates() {
   if (clientUpdatesInterval) {
      clearInterval(clientUpdatesInterval)
      clientUpdatesInterval = null
   }
}

function stopSendingDebugStats() {
   if (debugStatsInterval) {
      clearInterval(debugStatsInterval)
      debugStatsInterval = null
   }
}
