import serveStatic from 'serve-static-bun'

const serverStatic = Bun.serve({
   port: 8080,
   fetch: serveStatic('dist'),
})

//////////////

const clients = new Map()

export function setClient(clientId, data) {
   clients.set(clientId, data)
}

export function getClient(clientId) {
   return clients.get(clientId)
}

export function removeClient(clientId) {
   clients.delete(clientId)
}

export function getAllClients() {
   return Array.from(clients.entries()).reduce((acc, [key, value]) => {
      return { ...acc, [key]: value }
   }, {})
}

export function getClientsAsMap() {
   return clients
}

const serverWebsockets = Bun.serve({
   port: 7070,
   fetch: (req, server) => {
      const clientId = crypto.randomUUID()
      server.upgrade(req, {
         data: {
            id: clientId,
            createdAt: Date(),
         },
      })
      return new Response('Upgrade Failed', { status: 500 })
   },
   websocket: {
      open(ws) {
         console.log(ws.data)
         const msg = `${ws.data.id} has entered the chat`
         console.log(msg)
         setClient(ws.data.id, {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            action: '3',
            userName: '',
            microphone: false,
         })
         ws.subscribe('global')
         ws.publish('global', msg)
      },
      message(ws, message) {
         // this is a group chat
         // so the server re-broadcasts incoming message to everyone
         ws.publish('global', `${ws.data.username}: ${message}`)
      },
      close(ws) {
         const msg = `${ws.data.id} has left the chat`
         removeClient(ws.data.id)
         ws.unsubscribe('global')
         serverWebsockets.publish('global', JSON.stringify(getAllClients()))
      },
   },
})

setInterval(() => {
   //console.log(clients)
   console.log(getAllClients())
   return serverWebsockets.publish('global', JSON.stringify(getAllClients()))
}, 1000)

console.log(`Static - Listening on ${serverStatic.hostname}:${serverStatic.port}`)
console.log(`WS - Listening on ${serverWebsockets.hostname}:${serverWebsockets.port}`)
