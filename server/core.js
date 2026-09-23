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
import * as store from './store.js'
import * as timeclock from './timeclock.js'

// A synchronous throw must land in the same catch as a rejected promise, hence .then. Same as index.js.
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res))
  .catch(err => { if (!err.status) console.error(err); res.status(err.status || 500).json({ error: err.message }) })

/**
 * The few numbers the tray shows (roadmap 102): open tasks, Today against its cap, the clock's state and the
 * time of the punch that set it. Read straight from the store and the time clock, no auth or Graph calls, so
 * the tray can ask every 30 seconds without waking anything up.
 */
export function counts() {
  const open = store.allTasks().filter(t => !t.done)
  const snap = timeclock.snapshot()
  const last = k => snap.events.filter(e => e.kind === k).at(-1)?.label || null
  const since = snap.status === 'in' ? last('in') : snap.status === 'lunch' ? last('lunchOut') : snap.status === 'out' ? last('out') : null
  return { today: open.filter(t => t.lane === 'today').length, open: open.length, todayCap: store.TODAY_CAP, clock: { status: snap.status, in: last('in'), since } }
}

export function registerRoutes(app) {
  app.get('/api/counts', wrap((_req, res) => res.json(counts())))
  for (const m of [leadtimes, reminders, drift, health, history, backup]) m.registerRoutes(app, wrap)
}

/** Background timers: the ten-minute reminder tick and the health refresh. */
export function start() {
  reminders.start()
  health.start()
}
export function stop() { reminders.stop(); health.stop() }
