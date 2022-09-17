import { createRoot } from 'react-dom/client'
import * as React from 'react'
import App from './App'
import './App.css'

createRoot(document.getElementById('root') as HTMLElement).render(<App />)

const backup = console.error
console.error = function filterWarnings(msg) {
   const supressedWarnings = ['Warning:']
   if (!supressedWarnings.some((entry) => msg.includes(entry))) {
      backup.apply(console, arguments)
   }
}
