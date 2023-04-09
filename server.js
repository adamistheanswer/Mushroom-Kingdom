import fs from 'fs'
import express from 'express'
import { createServer } from 'vite'
import viteConfig from './vite.config.js'
import { WebSocketServer } from 'ws'
import http from 'http'
import Router from 'express-promise-router'
import 'dotenv/config'
import ShortUniqueId from 'short-unique-id'
import { encode, decode } from '@msgpack/msgpack'

const SIGNAL_OFFER = 'signal_offer'
const SIGNAL_ANSWER = 'signal_answer'
const SIGNAL_ICE_CANDIDATE = 'signal_ice_candidate'
const STATE_SET_USERNAME = 'setUserName'
const STATE_SET_CLIENT_ACTION = 'playerAction'
const STATE_SET_CLIENT_MOVEMENT = 'move'
const VOICE_CHAT_STATUS_UPDATE = 'voice_chat_status_update'

const uid = new ShortUniqueId({ length: 10 })

const router = Router()
const app = express()

if (process.env.NODE_ENV === 'development') {
   const vite = await createServer({
      configFile: false,
      server: {
         middlewareMode: true,
      },
      ...viteConfig,
   })
   router.use(vite.middlewares)
} else {
   app.use(express.static('dist'))
}

router.get('/', async (req, res) => {
   let html = fs.readFileSync('index.html', 'utf-8')
   if (process.env.NODE_ENV === 'development') {
      html = await vite.transformIndexHtml(req.url, html)
   }
   res.send(html)
})

router.use('*', (req, res) => {
   res.status(404).send({ message: 'Not Found' })
})

app.use(router)

const httpServer = http.createServer(app)
const wsServer = new WebSocketServer({ server: httpServer })

let clients = new Map()
let largeScenery = []
let smallScenery = []

function randomBetween(min, max) {
   return Math.random() * (max - min) + min
}

function sendActiveClients() {
   let clientsPayload = Array.from(clients.entries()).reduce((acc, [key, value]) => {
      return { ...acc, [key]: value }
   }, {})

   const response = {
      type: 'activeClients',
      payload: clientsPayload,
   }

   const encodedResponse = encode(response)
   wsServer.clients.forEach((client) => {
      client.send(encodedResponse)
   })
}

function sendNewClient(clientId) {
   const response = {
      type: 'newClient',
      payload: clientId,
   }
   const encodedResponse = encode(response)
   wsServer.clients.forEach((client) => {
      client.send(encodedResponse)
   })
}

function sendRemoveClient(clientId) {
   const response = {
      type: 'removeClient',
      payload: clientId,
   }
   const encodedResponse = encode(response)

   wsServer.clients.forEach((client) => {
      client.send(encodedResponse)
   })
}

function sendLargeScenery(client) {
   const response = {
      type: 'largeScenery',
      payload: largeScenery,
   }
   const encodedResponse = encode(response)
   client.send(encodedResponse)
}

function sendSmallScenery(client) {
   const response = {
      type: 'smallScenery',
      payload: smallScenery,
   }
   const encodedResponse = encode(response)
   client.send(encodedResponse)
}

function sendClientUpdates() {
   const response = {
      type: 'clientUpdates',
      payload: Array.from(clients.entries()).reduce((acc, [key, value]) => {
         acc[key] = value
         return acc
      }, {}),
   }
   const encodedResponse = encode(response)
   wsServer.clients.forEach((client) => {
      client.send(encodedResponse)
   })
}

function sendClientId(client, clientId) {
   const response = {
      type: 'clientId',
      payload: clientId,
   }
   const encodedResponse = encode(response)
   client.send(encodedResponse)
}

function handleSignalOffer(sender, message) {
   const { targetId, offer } = message.payload
   const target = getClientById(targetId)

   if (target) {
      const response = { type: SIGNAL_OFFER, payload: { senderId: sender.clientId, offer } }

      target.send(encode(response))
   }
}

function handleSignalAnswer(sender, message) {
   const { targetId, answer } = message.payload
   const target = getClientById(targetId)

   if (target) {
      target.send(encode({ type: SIGNAL_ANSWER, payload: { senderId: sender.clientId, answer } }))
   }
}

function handleSignalIceCandidate(sender, message) {
   const { targetId, candidate } = message.payload
   const target = getClientById(targetId)

   if (target) {
      target.send(encode({ type: SIGNAL_ICE_CANDIDATE, payload: { senderId: sender.clientId, candidate } }))
   }
}

function handleStateSetUserName(clientId, message) {
   const userName = message.payload
   if (userName === '') {
      if (clients.get(clientId)) {
         clients.get(clientId).userName = clientId
      }
   } else {
      if (clients.get(clientId)) {
         clients.get(clientId).userName = userName
      }
   }
}

function handleStateSetPlayerAction(clientId, message) {
   const { action } = message.payload
   if (clients.get(clientId)) {
      clients.get(clientId).action = action
   }
}

function handleStateSetPlayerMovement(clientId, message) {
   const { rotation, position, action } = message.payload
   if (clients.get(clientId)) {
      clients.get(clientId).position = position
      clients.get(clientId).rotation = rotation
      clients.get(clientId).action = action
   }
}

function handleVoiceChatStatusUpdate(sender, message) {
   const { voiceChatEnabled } = message.payload

   const clientData = clients.get(sender.clientId)
   clientData.voiceChatEnabled = voiceChatEnabled
   clients.set(sender.clientId, clientData)

   const response = {
      type: 'voiceChatStatusUpdate',
      payload: { clientId: sender.clientId, voiceChatEnabled },
   }

   const encodedResponse = encode(response)

   Array.from(wsServer.clients).forEach((client) => {
      client.send(encodedResponse)
   })
}

function getClientById(clientId) {
   return Array.from(wsServer.clients).find((client) => client.clientId === clientId)
}

wsServer.on('connection', (socket) => {
   const clientId = uid()
   socket.clientId = clientId

   console.log(`User ${clientId} connected - ${clients.size + 1} active users`)

   clients.set(clientId, {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      action: '3',
      userName: '',
      voiceChatEnabled: false, // Add this line
   })

   sendNewClient(clientId)
   sendClientId(socket, clientId)
   sendActiveClients(socket)

   if (largeScenery.length === 0) {
      largeScenery = Array.from({ length: 100 }, () => {
         return [
            Math.floor(Math.random() * 10),
            Math.ceil(Math.random() * 475) * (Math.round(Math.random()) ? 1 : -1),
            Math.ceil(Math.random() * 475) * (Math.round(Math.random()) ? 1 : -1),
            randomBetween(0.4, 0.7),
            randomBetween(0, 3),
         ]
      })
   }

   if (smallScenery.length === 0) {
      smallScenery = Array.from({ length: 400 }, () => {
         return [
            10 + Math.floor(Math.random() * 17),
            Math.ceil(Math.random() * 500) * (Math.round(Math.random()) ? 1 : -1),
            Math.ceil(Math.random() * 500) * (Math.round(Math.random()) ? 1 : -1),
            randomBetween(0.2, 0.32),
            randomBetween(0, 3),
         ]
      })
   }

   sendLargeScenery(socket)
   sendSmallScenery(socket)

   socket.on('message', (data) => {
      const message = decode(data)
      switch (message.type) {
         case SIGNAL_OFFER:
            handleSignalOffer(socket, message)
            break
         case SIGNAL_ANSWER:
            handleSignalAnswer(socket, message)
            break
         case SIGNAL_ICE_CANDIDATE:
            handleSignalIceCandidate(socket, message)
            break
         case STATE_SET_USERNAME:
            handleStateSetUserName(clientId, message)
            break
         case STATE_SET_CLIENT_MOVEMENT:
            handleStateSetPlayerMovement(clientId, message)
            break
         case STATE_SET_CLIENT_ACTION:
            handleStateSetPlayerAction(clientId, message)
            break
         case VOICE_CHAT_STATUS_UPDATE:
            handleVoiceChatStatusUpdate(socket, message)
            break
      }
   })

   setInterval(sendClientUpdates, 40)

   socket.on('close', () => {
      console.log(`User ${clientId} disconnected - ${clients.size - 1} active users`)

      if (Object.keys(clients).length === 1) {
         largeScenery = []
         smallScenery = []
      }
      sendRemoveClient(clientId)
      clients.delete(clientId)
      sendClientUpdates()

      const disconnectMessage = {
         type: 'clientDisconnect',
         payload: clientId,
      }

      const encodedResponse = encode(disconnectMessage)

      wsServer.clients.forEach((client) => {
         if (client !== socket) {
            client.send(encodedResponse)
         }
      })
   })
})

const updateInterval = setInterval(sendClientUpdates, 100)

process.on('SIGTERM', () => {
   clearInterval(updateInterval)
})

httpServer.listen(process.env.PORT || 8080, () => {
   console.log(`Listening on port http://localhost:8080...`)
})
