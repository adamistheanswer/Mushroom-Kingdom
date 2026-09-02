import { WebSocketServer } from 'ws'
import { handleConnection } from './connectionHandler.js'

// `ws` accepts 100MB frames by default, which lets one client exhaust the process heap. Nothing a
// client legitimately sends comes close - the largest is a WebRTC offer at a few kilobytes.
const MAX_WS_PAYLOAD = 64 * 1024
const HEARTBEAT_INTERVAL_MS = 30000

function markSocketAlive() {
   this.isAlive = true
}

/**
 * A socket lost without a close frame - a shut laptop lid, a phone off the network - otherwise
 * lingers as a player nobody can see leave, so an unanswered ping is treated as a disconnect.
 */
function startHeartbeat(wsServer) {
   const heartbeat = setInterval(() => {
      wsServer.clients.forEach((socket) => {
         if (socket.isAlive === false) {
            socket.terminate()
            return
         }

         socket.isAlive = false
         socket.ping()
      })
   }, HEARTBEAT_INTERVAL_MS)

   wsServer.on('close', () => {
      clearInterval(heartbeat)
   })
}

export function attachWebSocketServer(httpServer) {
   const wsServer = new WebSocketServer({ server: httpServer, maxPayload: MAX_WS_PAYLOAD })

   wsServer.on('connection', (socket) => {
      socket.isAlive = true
      socket.on('pong', markSocketAlive)
      handleConnection(socket)
   })

   startHeartbeat(wsServer)

   return wsServer
}
