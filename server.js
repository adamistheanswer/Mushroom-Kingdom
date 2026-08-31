import dotenv from 'dotenv'
dotenv.config()
import { WebSocketServer } from 'ws'
import { handleConnection, startSendingClientUpdates } from './server/websockets/connectionHandler.js'
import fs from 'fs'
import viteConfig from './vite.config.js'
import { createServer } from 'vite'
import express from 'express'
import http from 'http'

const router = express.Router()
const app = express()
let vite

if (process.env.NODE_ENV === 'development') {
   vite = await createServer({
      configFile: false,
      appType: 'custom',
      server: {
         middlewareMode: true,
      },
      ...viteConfig,
   })
   router.use(vite.middlewares)
} else {
   app.use(express.static('dist'))
}

router.get('/', async (req, res, next) => {
   try {
      let html = fs.readFileSync('index.html', 'utf-8')
      if (vite) {
         html = await vite.transformIndexHtml(req.url, html)
      }
      res.send(html)
   } catch (error) {
      next(error)
   }
})

router.use((req, res) => {
   res.status(404).send({ message: 'Not Found' })
})

app.use(router)

const httpServer = http.createServer(app)
export const wsServer = new WebSocketServer({ server: httpServer })

function markSocketAlive() {
   this.isAlive = true
}

wsServer.on('connection', (socket) => {
   socket.isAlive = true
   socket.on('pong', markSocketAlive)
   handleConnection(socket)
})

const wsHeartbeatInterval = setInterval(() => {
   wsServer.clients.forEach((socket) => {
      if (socket.isAlive === false) {
         socket.terminate()
         return
      }

      socket.isAlive = false
      socket.ping()
   })
}, 30000)

wsServer.on('close', () => {
   clearInterval(wsHeartbeatInterval)
})

startSendingClientUpdates()

httpServer.listen(process.env.PORT || 8080, () => {
   const port = process.env.PORT || 8080
   console.log(`Listening on port http://localhost:${port}...`)
})
