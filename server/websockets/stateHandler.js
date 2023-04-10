import { setClient, getClient } from '../state/clientState.js'
import { broadcastClientVoiceChatStatusUpdate } from './broadcastHandler.js'

export function handleStateSetVoiceChatStatus(message) {
   const { voiceChatEnabled, clientId } = message.payload
   const clientData = getClient(clientId)
   clientData.microphone = voiceChatEnabled
   setClient(clientId, clientData)
   broadcastClientVoiceChatStatusUpdate(clientId, voiceChatEnabled)
}

export function handleStateSetUserName(clientId, message) {
   const userName = message.payload
   const clientData = getClient(clientId)
   if (userName === '') {
      clientData.userName = clientId
   } else {
      clientData.userName = userName
   }
   setClient(clientId, clientData)
}

export function handleStateSetPlayerAction(clientId, message) {
   const { action } = message.payload
   const clientData = getClient(clientId)
   clientData.action = action
   setClient(clientId, clientData)
}

export function handleStateSetPlayerMovement(clientId, message) {
   const { rotation, position, action } = message.payload
   const clientData = getClient(clientId)
   clientData.position = position
   clientData.rotation = rotation
   clientData.action = action
   setClient(clientId, clientData)
}
