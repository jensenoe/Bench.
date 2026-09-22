import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load .env before anything reads process.env
const envPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  try { process.loadEnvFile(envPath) }
  catch {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

const express = (await import('express')).default
const store = await import('./store.js')
const auth = await import('./auth.js')
const { completeInPlanner } = await import('./planner.js')
const { syncAll, syncSource, sourceStatus, SOURCES } = await import('./sources/index.js')
const { bridge } = await import('./bridge.js')
const timeclock = await import('./timeclock.js')
const settings = await import('./settings.js')
const notes = await import('./notes.js')
const calendar = await import('./calendar.js')

const PORT = Number(process.env.PORT || 5178)
const app = express()
app.use(express.json({ limit: '1mb' }))

const wrap = fn => (req, res) => Promise.resolve(fn(req, res))
  .catch(err => { console.error(err); res.status(500).json({ error: err.message }) })

/** Settings as the UI sees them (no internal flags). */
const publicSettings = () => { const { _pathSetByUser, ...rest } = settings.get(); return { ...rest, firstName: settings.displayFirstName() } }

app.get('/api/settings', wrap((_req, res) => res.json(publicSettings())))
app.put('/api/settings', wrap((req, res) => {
  const before = settings.get()
  settings.update(req.body || {})
  const after = settings.get()
  if (before.timesheetPath !== after.timesheetPath || before.timesheetUrl !== after.timesheetUrl || before.name !== after.name) timeclock.invalidate()
  res.json(publicSettings())
}))

app.get('/api/state', wrap(async (_req, res) => {
  const account = await auth.getAccount()
  res.json({
    tasks: store.allTasks(),
    meta: store.getMeta(),
    sources: await sourceStatus(),
    desktop: bridge.desktop,
    settings: publicSettings(),
    logbookCount: notes.listEntries().length,
    napkinCount: notes.listMaps().length,
    version: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version,
    auth: {
      configured: auth.isConfigured(),
      signedIn: Boolean(account),
      username: account?.username || null,
      pending: auth.getPendingDeviceCode(),
      lastError: auth.getLastSignInError(),
      extra: auth.extraStatus(),                 // issue list + calendar: granted, or waiting on an admin
      adminConsentUrl: auth.adminConsentUrl(),
      canWriteBack: auth.isConfigured() && auth.scopes().some(s => s.includes('ReadWrite'))
    }
  })
}))

app.post('/api/tasks', wrap((req, res) => {
  if (!req.body?.title?.trim()) return res.status(400).json({ error: 'title required' })
  res.json(store.createTask(req.body))
}))

app.patch('/api/tasks/:id', wrap(async (req, res) => {
  const before = store.allTasks().find(t => t.id === req.params.id)
  const t = store.updateTask(req.params.id, req.body || {})
  if (!t) return res.status(404).json({ error: 'not found' })

  // Completing a Planner-sourced task completes it upstream too.
  let writeBack = null
  if (t.source === 'planner' && t.plannerId && t.done && !before?.done) {
    writeBack = await completeInPlanner(t.plannerId)
  }
  res.json({ task: t, writeBack })
}))

app.delete('/api/tasks/:id', wrap((req, res) => {
  res.json({ deleted: store.deleteTask(req.params.id) })
}))

app.post('/api/sync', wrap(async (_req, res) => res.json(await syncAll())))
app.post('/api/sync/:source', wrap(async (req, res) => {
  if (!SOURCES[req.params.source]) return res.status(404).json({ error: 'unknown source' })
  res.json(await syncSource(req.params.source))
}))
app.post('/api/sources/:source/signin', wrap(async (req, res) => {
  const def = SOURCES[req.params.source]
  if (!def) return res.status(404).json({ error: 'unknown source' })
  if (!bridge.desktop || !bridge.openSignIn) return res.status(400).json({ error: 'Sign-in windows need the desktop app.' })
  const how = await bridge.openSignIn(def.origin, def.probe)
  res.json({ signIn: how, ...(await syncSource(req.params.source)) })
}))
// Logbook
app.get('/api/logbook', wrap((_req, res) => res.json(notes.listEntries())))
app.post('/api/logbook', wrap((req, res) => res.json(notes.createEntry(req.body || {}))))
app.patch('/api/logbook/:id', wrap((req, res) => { const e = notes.updateEntry(req.params.id, req.body || {}); e ? res.json(e) : res.status(404).json({ error: 'not found' }) }))
app.delete('/api/logbook/:id', wrap((req, res) => res.json({ deleted: notes.deleteEntry(req.params.id) })))
/** An action item becomes a task on the board (Active lane), remembering where it came from. */
app.post('/api/logbook/:id/actions/:aid/to-board', wrap((req, res) => {
  const e = notes.listEntries().find(x => x.id === req.params.id); if (!e) return res.status(404).json({ error: 'not found' })
  const a = e.actions.find(x => x.id === req.params.aid); if (!a) return res.status(404).json({ error: 'no such action' })
  if (a.taskId && store.allTasks().some(t => t.id === a.taskId)) return res.json({ task: store.allTasks().find(t => t.id === a.taskId), entry: e })
  const t = store.createTask({ title: a.text, lane: 'active', dueDate: a.due || null, assignedBy: e.title, lead: a.owner || null, project: e.project || null, tags: ['logbook'], notes: `From the logbook: ${e.title}, ${e.date}` })
  a.taskId = t.id
  res.json({ task: t, entry: notes.updateEntry(e.id, { actions: e.actions }) })
}))

app.get('/api/calendar/today', wrap(async (_req, res) => res.json(await calendar.todaysMeetings())))

// Napkin
app.get('/api/napkin', wrap((_req, res) => res.json(notes.listMaps())))
app.post('/api/napkin', wrap((req, res) => res.json(notes.createMap(req.body || {}))))
app.patch('/api/napkin/:id', wrap((req, res) => { const m = notes.updateMap(req.params.id, req.body || {}); m ? res.json(m) : res.status(404).json({ error: 'not found' }) }))
app.delete('/api/napkin/:id', wrap((req, res) => res.json({ deleted: notes.deleteMap(req.params.id) })))

/** Last seven days: hours, completions, logbook entries. The week strip on Home. */
app.get('/api/week', wrap((_req, res) => {
  const days = timeclock.days(7)
  const tasks = store.allTasks(), entries = notes.listEntries()
  res.json(days.map(d => ({
    ...d,
    completed: tasks.filter(t => t.completedAt && t.completedAt.slice(0, 10) === d.date && t.completedBy === 'local').length,
    added: tasks.filter(t => t.createdAt && t.createdAt.slice(0, 10) === d.date && (!t.source || t.source === 'local')).length,
    logbook: entries.filter(e => e.date === d.date).length
  })))
}))

app.get('/api/timeclock', wrap((_req, res) => res.json(timeclock.snapshot())))
app.post('/api/timeclock/punch', wrap(async (req, res) => res.json(await timeclock.punch(req.body?.kind))))
app.post('/api/timeclock/reset', wrap((_req, res) => res.json(timeclock.resetToday())))
app.post('/api/auth/signin', wrap(async (req, res) => res.json(await auth.signIn({ tier: req.body?.tier || 'core' }))))
app.post('/api/auth/signout', wrap(async (_req, res) => { await auth.signOut(); res.json({ ok: true }) }))

// Serve the built frontend when it exists (npm run build && npm start)
const dist = path.join(__dirname, '..', 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

// 127.0.0.1, never 0.0.0.0 - this must not be reachable from the network.
export function listen(port = PORT) { return app.listen(port, '127.0.0.1', () => {
  console.log(`\n  Bench API       http://127.0.0.1:${port}`)
  console.log(`  Planner sync    ${auth.isConfigured() ? 'configured' : 'not configured (local-only mode)'}`)
  if (fs.existsSync(dist)) console.log(`  Dashboard       http://127.0.0.1:${port}\n`)
  else console.log(`  Dashboard       http://127.0.0.1:5177  (vite dev)\n`)
}) }
if (!process.env.BENCH_EMBEDDED) listen()

// Morning digest: what Home would warn about, as three short lines.
timeclock.setDigestSource(() => {
  const DAY = 86400000
  const open = store.allTasks().filter(t => !t.done)
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0)
  const daysUntil = iso => Math.round((new Date(iso).setHours(0, 0, 0, 0) - midnight) / DAY)
  const lines = []
  const soon = open.filter(t => t.orderBy && daysUntil(t.orderBy) <= 3)
  if (soon.length) lines.push(soon.length === 1 ? `Order by ${daysUntil(soon[0].orderBy) < 0 ? 'passed' : 'in ' + daysUntil(soon[0].orderBy) + 'd'}: ${soon[0].title}` : `${soon.length} order dates inside three days`)
  const stale = open.filter(t => t.lane === 'waiting' && t.waitingSince && (Date.now() - new Date(t.waitingSince)) / DAY >= 7)
  if (stale.length) lines.push(stale.length === 1 ? `With ${stale[0].waitingOn || 'someone'} for ${Math.floor((Date.now() - new Date(stale[0].waitingSince)) / DAY)} days: ${stale[0].title}` : `${stale.length} items with other people for over a week`)
  const inno = open.filter(t => t.lane === 'innovation')
  const cold = inno.length ? Math.min(...inno.map(t => (Date.now() - new Date(t.lastTouched || t.updatedAt)) / DAY)) : 0
  if (inno.length && cold >= 21) lines.push(`Innovation has not moved in ${Math.floor(cold)} days`)
  return lines
})
timeclock.startScheduler()

// Background poll while the app is running.
const mins = Number(process.env.SYNC_INTERVAL_MINUTES || 5)
if ((auth.isConfigured() || bridge.desktop) && mins > 0) {
  setInterval(async () => {
    const r = await syncAll()
    for (const [k, v] of Object.entries(r)) if (v.ok) console.log(`[sync:${k}] ${v.fetched} (+${v.added}, ${v.closed} closed)`)
  }, mins * 60_000)
}
export { app }
