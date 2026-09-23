/**
 * Notification history (roadmap 107). Every desktop notification Bench sends goes through here: it is
 * written to BENCH_USER_DIR/notifications.json (newest first, 200 kept) and then handed to the desktop
 * shell (`bridge.notify`), which shows the Windows toast. The Bell in the nav reads the list, so a toast
 * that was missed is still there, and a row goes where the toast would have gone.
 *
 *   GET  /api/notifications?limit=20   { items: [{ id, at, title, body, route, read }], unread }
 *   POST /api/notifications/read       { ids: [...] } or { all: true }  ->  { unread }
 *
 * Nothing here throws at a caller: the modules that notify run on timers and must not die over a full disk.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { bridge } from './bridge.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(
  process.env.BENCH_USER_DIR || process.env.BENCH_SECRETS_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data'),
  'notifications.json'
)
/** How many are kept. Older ones fall off the end. */
export const CAP = 200
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))

let memo = null
function load() {
  if (memo) return memo
  try { memo = JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { memo = { items: [] } }
  if (!Array.isArray(memo.items)) memo.items = []
  return memo
}
function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(memo, null, 2)); fs.renameSync(FILE + '.tmp', FILE)
  } catch (err) { console.warn('[notify] not saved:', err.message) }
}

/** Record it, then show it. Returns the stored item. */
export function notify(payload = {}) {
  const m = load()
  const item = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    title: String(payload.title || '').trim() || 'Bench.',
    body: String(payload.body || ''),
    route: typeof payload.route === 'string' && payload.route ? payload.route : null,
    read: false
  }
  m.items.unshift(item)
  if (m.items.length > CAP) m.items.length = CAP
  save()
  try { bridge.notify?.(payload) } catch (err) { console.warn('[notify] desktop refused it:', err.message) }
  return item
}

/** The last `limit`, newest first. */
export function list(limit = 20) {
  const n = Math.max(1, Math.min(CAP, Number(limit) || 20))
  return load().items.slice(0, n)
}
/** How many have not been read. */
export const unread = () => load().items.filter(i => !i.read).length

/** Mark some ids read, or 'all'. Returns the unread count that is left. */
export function markRead(ids) {
  const m = load()
  const all = ids === 'all'
  const set = new Set(Array.isArray(ids) ? ids.map(String) : [])
  let changed = 0
  for (const i of m.items) if (!i.read && (all || set.has(i.id))) { i.read = true; changed++ }
  if (changed) save()
  return unread()
}

export function registerRoutes(app) {
  app.get('/api/notifications', wrap((req, res) => res.json({ items: list(req.query.limit), unread: unread() })))
  app.post('/api/notifications/read', wrap((req, res) => {
    const b = req.body || {}
    res.json({ unread: markRead(b.all === true ? 'all' : (Array.isArray(b.ids) ? b.ids : [])) })
  }))
}
