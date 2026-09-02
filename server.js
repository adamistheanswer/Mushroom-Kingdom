import dotenv from 'dotenv'
dotenv.config()

import http from 'http'
import { createHttpApp } from './server/http/app.js'
import { startBroadcastLoops } from './server/websockets/broadcastLoops.js'
import { attachWebSocketServer } from './server/websockets/wsServer.js'

const PORT = process.env.PORT || 8080

const httpServer = http.createServer(await createHttpApp())

attachWebSocketServer(httpServer)
startBroadcastLoops()

httpServer.listen(PORT, () => {
   console.log(`Listening on port http://localhost:${PORT}...`)
})
