import { getClient, setClient } from './clientState.js'
import { markClientUpdated } from './clientUpdates.js'

// Movement is trusted from the client, so the only check is that it stays inside the map.
const CLIENT_WORLD_LIMIT = 485
const CLIENT_MOVEMENT_INTERVAL_MS = 50
const lastMovementAcceptedAt = new Map()
const pendingMovementMessages = new Map()
const pendingMovementTimers = new Map()

function arraysEqual(a, b) {
   if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
   }

   return a.every((value, index) => value === b[index])
}

// Only yaw matters for an upright character, and dropping the other two axes keeps the update small.
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

   return [clamp(x, -CLIENT_WORLD_LIMIT, CLIENT_WORLD_LIMIT), y, clamp(z, -CLIENT_WORLD_LIMIT, CLIENT_WORLD_LIMIT)]
}

function clearPendingMovement(clientId) {
   const timer = pendingMovementTimers.get(clientId)

   if (timer) {
      clearTimeout(timer)
      pendingMovementTimers.delete(clientId)
   }

   pendingMovementMessages.delete(clientId)
}

function applyClientMovement(clientId, message, receivedAt = Date.now()) {
   const { rotation, position, action } = message.payload
   const clientData = getClient(clientId)

   if (!clientData) {
      return
   }

   const nextRotation = normaliseMovementRotation(rotation)
   const nextPosition = normaliseMovementPosition(position, clientData.position)
   const actionChanged = clientData.action !== action
   const positionChanged = !arraysEqual(clientData.position, nextPosition)
   const rotationChanged = !arraysEqual(clientData.rotation, nextRotation)

   // A standing player still sends movement frames; marking them dirty would broadcast nothing new.
   if (!actionChanged && !positionChanged && !rotationChanged) {
      lastMovementAcceptedAt.set(clientId, receivedAt)
      return
   }

   clientData.position = nextPosition
   clientData.rotation = nextRotation
   clientData.action = action
   setClient(clientId, clientData)
   lastMovementAcceptedAt.set(clientId, receivedAt)

   const dirtyFields = positionChanged || rotationChanged ? ['position', 'rotation'] : []
   if (actionChanged) {
      dirtyFields.push('action')
   }

   markClientUpdated(clientId, dirtyFields)
}

function flushPendingMovement(clientId) {
   pendingMovementTimers.delete(clientId)

   const pendingMessage = pendingMovementMessages.get(clientId)
   pendingMovementMessages.delete(clientId)

   if (pendingMessage) {
      applyClientMovement(clientId, pendingMessage)
   }
}

export function clearClientMovementQueue(clientId) {
   clearPendingMovement(clientId)
   lastMovementAcceptedAt.delete(clientId)
}

export function handleClientMovement(clientId, message) {
   const now = Date.now()
   const lastAcceptedAt = lastMovementAcceptedAt.get(clientId) ?? 0
   const waitMs = CLIENT_MOVEMENT_INTERVAL_MS - (now - lastAcceptedAt)

   if (waitMs <= 0) {
      clearPendingMovement(clientId)
      applyClientMovement(clientId, message, now)
      return
   }

   pendingMovementMessages.set(clientId, message)

   if (!pendingMovementTimers.has(clientId)) {
      const timer = setTimeout(() => flushPendingMovement(clientId), waitMs)
      timer.unref?.()
      pendingMovementTimers.set(clientId, timer)
   }
}

export function handleClientAction(clientId, message) {
   flushPendingMovement(clientId)

   const { action } = message.payload
   const clientData = getClient(clientId)

   if (!clientData || clientData.action === action) {
      return
   }

   clientData.action = action
   setClient(clientId, clientData)
   markClientUpdated(clientId, 'action')
}

export function handleClientUserName(clientId, message) {
   const clientData = getClient(clientId)

   if (!clientData) {
      return
   }

   // An unnamed player is labelled by id rather than left blank above an empty nameplate.
   const nextUserName = message.payload === '' ? clientId : message.payload

   if (clientData.userName === nextUserName) {
      return
   }

   clientData.userName = nextUserName
   setClient(clientId, clientData)
   markClientUpdated(clientId, 'userName')
}
