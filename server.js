import fs from 'fs'
import express from 'express'
import Router from 'express-promise-router'
import { createServer } from 'vite'
import viteConfig from './vite.config.js'
import { Server } from 'socket.io'
import parser from 'socket.io-msgpack-parser'

const router = Router()
const app = express()

if (process.env.ENVIRONMENT === 'local') {
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
   if (process.env.ENVIRONMENT === 'local') {
      html = await vite.transformIndexHtml(req.url, html)
   }
   res.send(html)
})

router.use('*', (req, res) => {
   res.status(404).send({ message: 'Not Found' })
})

app.use(router)

const server = app.listen(process.env.PORT || 8080, () => {
   console.log(`Listening on port http://localhost:8080...`)
})

const ioServer = new Server(server, { parser })

let clients = {}
let largeScenery = []
let smallScenery = []

ioServer.on('connection', (socket) => {
   console.log(`User ${socket.id} connected - ${ioServer.engine.clientsCount} active users`)

   clients[socket.id] = {
      p: [0, 0, 0],
      r: 0,
      s: 'Idle',
   }

   if (largeScenery.length === 0) {
      let newLargeObjects = new Array(125)

      for (let i = 0; i < newLargeObjects.length; i++) {
         newLargeObjects[i] = [
            Math.floor(Math.random() * 12),
            Math.ceil(Math.random() * 475) * (Math.round(Math.random()) ? 1 : -1),
            Math.ceil(Math.random() * 475) * (Math.round(Math.random()) ? 1 : -1),
         ]
      }

      largeScenery = newLargeObjects
      socket.emit('largeScenery', newLargeObjects)
   } else {
      socket.emit('largeScenery', largeScenery)
   }

   if (smallScenery.length === 0) {
      let newSmallScenery = new Array(400)

      for (let i = 0; i < newSmallScenery.length; i++) {
         newSmallScenery[i] = [
            Math.floor(Math.random() * 22),
            Math.ceil(Math.random() * 500) * (Math.round(Math.random()) ? 1 : -1),
            Math.ceil(Math.random() * 500) * (Math.round(Math.random()) ? 1 : -1),
         ]
      }

      smallScenery = newSmallScenery
      socket.emit('smallScenery', newSmallScenery)
   } else {
      socket.emit('smallScenery', smallScenery)
   }

   ioServer.sockets.emit('clientUpdates', clients)

   socket.on('move', ({ r, p, s }) => {
      console.log(r, p, s)
      if (clients[socket.id]) {
         clients[socket.id].p = p
         clients[socket.id].r = r
         clients[socket.id].s = s
      }
   })

   setInterval(() => {
      ioServer.sockets.emit('clientUpdates', clients)
   }, 100)

   socket.on('disconnect', () => {
      console.log(`User ${socket.id} disconnected - ${ioServer.engine.clientsCount} active users`)

      if (Object.keys(clients).length === 1) {
         largeScenery = []
         smallScenery = []
      }

      delete clients[socket.id]
      ioServer.sockets.emit('clientUpdate', clients)
   })
})
