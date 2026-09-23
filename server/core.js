/**
 * The one place server/index.js plugs the background modules in:
 *
 *   import { registerRoutes as registerCore, start as startCore } from './core.js'
 *   registerCore(app)   // after app.use(express.json(...)), before the static fallback
 *   startCore()         // once, after listen()
 *
 * Routes live in their own modules (each exports registerRoutes(app, wrap)); this file only lines them up.
 */
import * as leadtimes from './leadtimes.js'
import * as reminders from './reminders.js'
import * as drift from './drift.js'
import * as health from './health.js'
import * as history from './history.js'
import * as backup from './backup.js'

// A synchronous throw must land in the same catch as a rejected promise, hence .then. Same as index.js.
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res))
  .catch(err => { if (!err.status) console.error(err); res.status(err.status || 500).json({ error: err.message }) })

export function registerRoutes(app) {
  for (const m of [leadtimes, reminders, drift, health, history, backup]) m.registerRoutes(app, wrap)
}

/** Background timers: the ten-minute reminder tick and the health refresh. */
export function start() {
  reminders.start()
  health.start()
}
export function stop() { reminders.stop(); health.stop() }
