import { setClient, removeClient, getClientsAsMap } from '../state/clientState.js'
import { getLargeScenery, setLargeScenery, getSmallScenery, setSmallScenery } from '../state/sceneryState.js'
import { decode } from '@msgpack/msgpack'
import { uid } from '../utils/utils.js'
import { generateLargeScenery, generateSmallScenery } from '../utils/generateScenery.js'
import { sendClientId, sendLargeScenery, sendSmallScenery } from './InitialisationHander.js'
import { broadcastClientUpdates, broadcastActiveClients, broardcastClientDisconnect } from './broadcastHandler.js'
import {
   handleStateSetPlayerAction,
   handleStateSetPlayerMovement,
   handleStateSetVoiceChatStatus,
   handleStateSetUserName,
} from './stateHandler.js'
import { handleSignalMessage } from './signalHandler.js'

const STATE_SET_USERNAME = 'state_set_username'
const STATE_SET_CLIENT_ACTION = 'state_set_client_action'
const STATE_SET_CLIENT_MOVEMENT = 'move'
const STATE_SET_VOICE_CHAT_STATUS = 'state_set_client_voice_chat_status'

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

   socket.on('message', (data) => {
      const message = decode(data)
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
      }

      removeClient(clientId)
      broadcastClientUpdates()
      broardcastClientDisconnect(clientId)
   })
}

let clientUpdatesInterval = null

export function startSendingClientUpdates(intervalMs = 50) {
   if (clientUpdatesInterval) {
      stopSendingClientUpdates()
   }
   clientUpdatesInterval = setInterval(broadcastClientUpdates, intervalMs)
}

function stopSendingClientUpdates() {
   if (clientUpdatesInterval) {
      clearInterval(clientUpdatesInterval)
      clientUpdatesInterval = null
   }
}
