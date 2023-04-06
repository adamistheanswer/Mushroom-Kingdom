import fs from 'fs'
import express from 'express'
import { createServer } from 'vite'
import viteConfig from './vite.config.js'
import { WebSocketServer } from 'ws'
import http from 'http'
import Router from 'express-promise-router'
import 'dotenv/config'
import ShortUniqueId from 'short-unique-id'

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

function sendLargeScenery(client) {
   const message = {
      type: 'largeScenery',
      payload: largeScenery,
   }
   client.send(JSON.stringify(message))
}

function sendSmallScenery(client) {
   const message = {
      type: 'smallScenery',
      payload: smallScenery,
   }
   client.send(JSON.stringify(message))
}

function sendClientUpdates() {
   const message = {
      type: 'clientUpdates',
      payload: Array.from(clients.entries()).reduce((acc, [key, value]) => {
         acc[key] = value
         return acc
      }, {}),
   }
   const serializedMessage = JSON.stringify(message)

   wsServer.clients.forEach((client) => {
      client.send(serializedMessage)
   })
}

wsServer.on('connection', (socket) => {
   const clientId = uid()

   console.log(`User ${clientId} connected - ${clients.size + 1} active users`)

   socket.send(JSON.stringify({ type: 'clientId', payload: clientId }))

   clients.set(clientId, {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      action: [3],
   })

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
      const message = JSON.parse(data)
      if (message.type === 'move') {
         const { rotation, position, action } = message.payload
         console.log(message.payload)
         if (clients.get(clientId)) {

            clients.get(clientId).position = position
            clients.get(clientId).rotation = rotation
            clients.get(clientId).action = action
         }
      }
   })

   setInterval(sendClientUpdates, 40)

   socket.on('close', () => {
      console.log(`User ${clientId} disconnected - ${clients.size - 1} active users`)

      if (Object.keys(clients).length === 1) {
         largeScenery = []
         smallScenery = []
      }

      clients.delete(clientId)
      sendClientUpdates()

      const disconnectMessage = {
         type: 'clientDisconnect',
         payload: clientId,
      }
      const serializedDisconnectMessage = JSON.stringify(disconnectMessage)

      wsServer.clients.forEach((client) => {
         if (client !== socket) {
            client.send(serializedDisconnectMessage)
         }
      })
   })
})

httpServer.listen(process.env.PORT || 8080, () => {
   console.log(`Listening on port http://localhost:8080...`)
})
