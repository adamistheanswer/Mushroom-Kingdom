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

ioServer.on('connection', (socket) => {
    console.log(
        `User ${socket.id} connected - ${ioServer.engine.clientsCount} active users`
    )

    clients[socket.id] = {
        p: [0, 0, 0],
        r: 0,
    }

    ioServer.sockets.emit('clientUpdates', clients)

    socket.on('move', ({ r, p }) => {
        if (clients[socket.id]) {
            clients[socket.id].p = p
            clients[socket.id].r = r
        }

        // ioServer.sockets.emit('clientUpdates', clients)
    })

    setInterval(() => {
        ioServer.sockets.emit('clientUpdates', clients)
    }, 100)

    socket.on('disconnect', () => {
        console.log(
            `User ${socket.id} disconnected - ${ioServer.engine.clientsCount} active users`
        )

        delete clients[socket.id]

        ioServer.sockets.emit('clientUpdate', clients)
    })
})
