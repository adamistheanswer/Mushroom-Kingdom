import { setClient, getClient } from '../state/clientState.js'
import { broadcastClientVoiceChatStatusUpdate, markClientUpdated } from './broadcastHandler.js'

function arraysEqual(a, b) {
   if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
   }

   return a.every((value, index) => value === b[index])
}

function normaliseMovementRotation(rotation) {
   return [0, Number(rotation?.[1] ?? 0), 0]
}

export function handleStateSetVoiceChatStatus(message) {
   const { voiceChatEnabled, clientId } = message.payload
   const clientData = getClient(clientId)
   if (!clientData) return

   if (clientData.microphone === voiceChatEnabled) {
      return
   }

   clientData.microphone = voiceChatEnabled
   setClient(clientId, clientData)
   markClientUpdated(clientId)
   broadcastClientVoiceChatStatusUpdate(clientId, voiceChatEnabled)
}

export function handleStateSetUserName(clientId, message) {
   const userName = message.payload
   const clientData = getClient(clientId)
   if (!clientData) return

   const nextUserName = userName === '' ? clientId : userName
   if (clientData.userName === nextUserName) {
      return
   }

   clientData.userName = nextUserName
   setClient(clientId, clientData)
   markClientUpdated(clientId)
}

export function handleStateSetPlayerAction(clientId, message) {
   const { action } = message.payload
   const clientData = getClient(clientId)
   if (!clientData || clientData.action === action) return

   clientData.action = action
   setClient(clientId, clientData)
   markClientUpdated(clientId)
}

export function handleStateSetPlayerMovement(clientId, message) {
   const { rotation, position, action } = message.payload
   const clientData = getClient(clientId)
   if (!clientData) return
   const nextRotation = normaliseMovementRotation(rotation)

   const unchanged =
      clientData.action === action &&
      arraysEqual(clientData.position, position) &&
      arraysEqual(clientData.rotation, nextRotation)

   if (unchanged) {
      return
   }

   clientData.position = position
   clientData.rotation = nextRotation
   clientData.action = action
   setClient(clientId, clientData)
   markClientUpdated(clientId)
}
