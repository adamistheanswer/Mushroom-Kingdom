import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import macrosPlugin from 'vite-plugin-babel-macros'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
export default defineConfig({
   plugins: [
      react(),
      macrosPlugin(),
      nodePolyfills({
         // Whether to polyfill `node:` protocol imports.
         protocolImports: true,
      }),
   ],
})
