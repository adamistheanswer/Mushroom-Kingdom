import { setClient, getClient } from '../state/clientState.js'
import { addChatMessage } from '../state/chatState.js'
import { broadcastChatMessage, broadcastClientVoiceChatStatusUpdate, markClientUpdated } from './broadcastHandler.js'

const PLAYER_WORLD_LIMIT = 485

function arraysEqual(a, b) {
   if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
   }

   return a.every((value, index) => value === b[index])
}

function normaliseMovementRotation(rotation) {
   return [0, Number(rotation?.[1] ?? 0), 0]
}

function clamp(value, min, max) {
   return Math.min(Math.max(value, min), max)
}

function normaliseMovementPosition(position, fallbackPosition) {
   if (!Array.isArray(position) || position.length < 3) {
      return fallbackPosition
   }

   const x = Number(position[0])
   const y = Number(position[1])
   const z = Number(position[2])

   if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return fallbackPosition
   }

   return [clamp(x, -PLAYER_WORLD_LIMIT, PLAYER_WORLD_LIMIT), y, clamp(z, -PLAYER_WORLD_LIMIT, PLAYER_WORLD_LIMIT)]
}

// The id comes from the connection, never the payload, so nobody can flip another player's mic.
export function handleStateSetVoiceChatStatus(clientId, message) {
   const voiceChatEnabled = message.payload?.voiceChatEnabled === true
   const clientData = getClient(clientId)
   if (!clientData) return

   if (clientData.microphone === voiceChatEnabled) {
      return
   }

   clientData.microphone = voiceChatEnabled
   setClient(clientId, clientData)
   markClientUpdated(clientId, 'microphone')
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
   markClientUpdated(clientId, 'userName')
}

export function handleStateSetPlayerAction(clientId, message) {
   const { action } = message.payload
   const clientData = getClient(clientId)
   if (!clientData || clientData.action === action) return

   clientData.action = action
   setClient(clientId, clientData)
   markClientUpdated(clientId, 'action')
}

export function handleStateSetPlayerMovement(clientId, message) {
   const { rotation, position, action } = message.payload
   const clientData = getClient(clientId)
   if (!clientData) return
   const nextRotation = normaliseMovementRotation(rotation)
   const nextPosition = normaliseMovementPosition(position, clientData.position)

   const unchanged =
      clientData.action === action &&
      arraysEqual(clientData.position, nextPosition) &&
      arraysEqual(clientData.rotation, nextRotation)

   if (unchanged) {
      return
   }

   clientData.position = nextPosition
   clientData.rotation = nextRotation
   clientData.action = action
   setClient(clientId, clientData)
   markClientUpdated(clientId, ['position', 'rotation', 'action'])
}

export function handleChatMessage(clientId, message) {
   const clientData = getClient(clientId)
   if (!clientData) return

   const chatMessage = addChatMessage(clientId, clientData, message.payload?.text)
   if (!chatMessage) {
      return
   }

   broadcastChatMessage(chatMessage)
}
