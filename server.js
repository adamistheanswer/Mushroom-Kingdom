import dotenv from 'dotenv'
dotenv.config()
import { WebSocketServer } from 'ws'
import { handleConnection, startSendingClientUpdates, startSendingDebugStats } from './server/websockets/connectionHandler.js'
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

const DEFAULT_STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']

function parseUrlList(value, fallback = []) {
   if (!value) {
      return fallback
   }

   return value
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean)
}

/**
 * WebRTC only reaches peers behind symmetric NAT through a TURN relay. Serving the list here
 * keeps credentials out of the client bundle and lets them rotate without a rebuild.
 */
router.get('/ice-servers', (req, res) => {
   const iceServers = [{ urls: parseUrlList(process.env.STUN_URLS, DEFAULT_STUN_URLS) }]
   const turnUrls = parseUrlList(process.env.TURN_URLS)

   if (turnUrls.length > 0) {
      iceServers.push({
         urls: turnUrls,
         username: process.env.TURN_USERNAME,
         credential: process.env.TURN_CREDENTIAL,
      })
   }

   res.set('Cache-Control', 'no-store')
   res.json({ iceServers })
})

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

// `ws` accepts 100MB frames by default, which lets one client exhaust the process heap. Nothing
// a client legitimately sends comes close - the largest is a WebRTC offer at a few kilobytes.
const MAX_WS_PAYLOAD = 64 * 1024

export const wsServer = new WebSocketServer({ server: httpServer, maxPayload: MAX_WS_PAYLOAD })

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
startSendingDebugStats()

httpServer.listen(process.env.PORT || 8080, () => {
   const port = process.env.PORT || 8080
   console.log(`Listening on port http://localhost:${port}...`)
})
