import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/outfit'
import '@fontsource-variable/work-sans'
import App from './App.jsx'
import Fault from './components/Fault.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode><Fault><App /></Fault></React.StrictMode>
)

// Errors outside React's render (timers, promises) go to the same log, so a quiet failure leaves a trace.
addEventListener('error', e => { try { window.bench?.log?.(`window error: ${e.message} (${e.filename}:${e.lineno})`) } catch { /* ignore */ } })
addEventListener('unhandledrejection', e => { try { window.bench?.log?.(`unhandled rejection: ${e.reason?.stack || e.reason}`) } catch { /* ignore */ } })
