import fs from 'fs'
import express from 'express'
import Router from 'express-promise-router'
import { Server } from 'socket.io'

const router = Router()

router.get('/', async (req, res, next) => {
    let html = fs.readFileSync('index.html', 'utf-8')
    res.send(html)
})

router.use('*', (req, res) => {
    res.status(404).send({ message: 'Not Found' })
})

const app = express()
app.use(express.static('dist'))
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
