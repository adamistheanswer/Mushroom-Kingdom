import fs from 'fs'
import express from 'express'
import Router from 'express-promise-router'
import { createServer } from 'vite'
import viteConfig from './vite.config.js'
import { Server } from 'socket.io'

// Create router
const router = Router()

// Create vite front end dev server
const vite = await createServer({
    configFile: false,
    server: {
        middlewareMode: 'html',
    },
    ...viteConfig,
})

// Main route serves the index HTML
router.get('/', async (req, res, next) => {
    let html = fs.readFileSync('index.html', 'utf-8')
    html = await vite.transformIndexHtml(req.url, html)
    res.send(html)
})

// Use vite middleware so it rebuilds frontend
router.use(vite.middlewares)

// Everything else that's not index 404s
router.use('*', (req, res) => {
    res.status(404).send({ message: 'Not Found' })
})

// Create express app and listen on port 4444

const app = express()

app.use(router)

const server = app.listen(process.env.PORT || 8080, () => {
    console.log(`Listening on port http://localhost:8080...`)
})

const ioServer = new Server(server)

let clients = {}

ioServer.on('connection', (socket) => {
    console.log(
        `User ${socket.id} connected - ${ioServer.engine.clientsCount} active users`
    )

    clients[socket.id] = {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
    }

    ioServer.sockets.emit('clientUpdates', clients)

    socket.on('positionUpdate', ({ id, rotation, position }) => {
        clients[id].position = position
        clients[id].rotation = rotation
        ioServer.sockets.emit('clientUpdates', clients)
    })

    socket.on('disconnect', () => {
        console.log(
            `User ${socket.id} disconnected - ${ioServer.engine.clientsCount} active users`
        )

        delete clients[socket.id]

        ioServer.sockets.emit('clientUpdate', clients)
    })
})
