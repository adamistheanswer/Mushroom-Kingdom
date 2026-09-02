import dotenv from 'dotenv'
dotenv.config()
import { WebSocketServer } from 'ws'
import { handleConnection, startSendingClientUpdates, startSendingDebugStats } from './server/websockets/connectionHandler.js'
import fs from 'fs'
import viteConfig from './vite.config.js'
import { createServer } from 'vite'
import express from 'express'
import { getIceServers, warnAboutTurnConfiguration } from './server/utils/iceServers.js'
import compression from 'compression'
import http from 'http'

const router = express.Router()
const app = express()
let vite

// mime-db carries no `compressible` flag for FBX, so the default filter would skip the Forest
// models. They are largely float arrays and shed roughly a third of their bytes, so opt them in.
function shouldCompress(req, res) {
   if (res.getHeader('Content-Type') === 'application/vnd.autodesk.fbx') {
      return true
   }

   return compression.filter(req, res)
}

app.use(compression({ filter: shouldCompress }))

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

/**
 * WebRTC only reaches peers behind symmetric NAT through a TURN relay. Serving the list here
 * keeps credentials out of the client bundle, lets them rotate without a rebuild, and is what
 * makes short-lived minted credentials possible at all.
 */
router.get('/ice-servers', async (req, res) => {
   const iceServers = await getIceServers()

   res.set('Cache-Control', 'no-store')
   res.json({ iceServers })
})

warnAboutTurnConfiguration()

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
