import dotenv from 'dotenv'
dotenv.config()
import { WebSocketServer } from 'ws'
import { handleConnection, startSendingClientUpdates } from './server/websockets/connectionHandler.js'
import fs from 'fs'
import Router from 'express-promise-router'
import viteConfig from './vite.config.js'
import { createServer } from 'vite'
import express from 'express'
import http from 'http'

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
export const wsServer = new WebSocketServer({ server: httpServer })

wsServer.on('connection', handleConnection)

startSendingClientUpdates()

httpServer.listen(process.env.PORT || 8080, () => {
   console.log(`Listening on port http://localhost:8080...`)
})
