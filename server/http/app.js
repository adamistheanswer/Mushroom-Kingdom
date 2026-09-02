import compression from 'compression'
import express from 'express'
import fs from 'fs'
import { getIceServers } from '../voice/iceServers.js'

// mime-db carries no `compressible` flag for FBX, so the default filter would skip the Forest
// models. They are largely float arrays and shed roughly a third of their bytes, so opt them in.
function shouldCompress(req, res) {
   if (res.getHeader('Content-Type') === 'application/vnd.autodesk.fbx') {
      return true
   }

   return compression.filter(req, res)
}

// Imported lazily because vite is a devDependency - a production install will not have it on disk.
async function createViteDevServer() {
   const { createServer } = await import('vite')
   const { default: viteConfig } = await import('../../vite.config.js')

   return createServer({
      configFile: false,
      appType: 'custom',
      server: {
         middlewareMode: true,
      },
      ...viteConfig,
   })
}

function serveIceServers(req, res) {
   // Relay credentials are short-lived, so a cached response would hand out expired ones.
   res.set('Cache-Control', 'no-store')
   res.json({ iceServers: getIceServers() })
}

// In development the page has to go through vite so its transforms and HMR client are injected;
// in production `dist/index.html` is already built, but is still served by hand so that unknown
// paths fall through to the 404 below rather than silently returning the app shell.
function serveIndexHtml(vite) {
   return async (req, res, next) => {
      try {
         let html = fs.readFileSync('index.html', 'utf-8')

         if (vite) {
            html = await vite.transformIndexHtml(req.url, html)
         }

         res.send(html)
      } catch (error) {
         next(error)
      }
   }
}

export async function createHttpApp() {
   const app = express()
   const router = express.Router()
   const vite = process.env.NODE_ENV === 'development' ? await createViteDevServer() : null

   app.use(compression({ filter: shouldCompress }))

   if (vite) {
      router.use(vite.middlewares)
   } else {
      app.use(express.static('dist'))
   }

   router.get('/ice-servers', serveIceServers)
   router.get('/', serveIndexHtml(vite))
   router.use((req, res) => {
      res.status(404).send({ message: 'Not Found' })
   })

   app.use(router)

   return app
}
