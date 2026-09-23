/**
 * Photographs from the phone. When Settings names a folder (OneDrive's camera roll works), Bench
 * watches it for pictures taken in the last fourteen days and offers each one on the Board, to be
 * attached to a task as a link or dismissed. What was attached or dismissed is remembered in
 * BENCH_USER_DIR/inbox.json, so the file leaves the list without leaving the folder.
 *
 *   GET  /api/inbox                    -> { dir, ok, reason, files: [{ name, at, size, url }] }
 *   GET  /api/inbox/file?name=<name>   -> the picture itself
 *   POST /api/inbox/attach { name, taskId, label? }
 *   POST /api/inbox/dismiss { name }
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as settings from './settings.js'
import * as store from './store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const USER_DIR = process.env.BENCH_USER_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data')
const SEEN_FILE = path.join(USER_DIR, 'inbox.json')

export const DAYS = 14
export const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.heic': 'image/heic', '.webp': 'image/webp' }
const POLL_MS = 30_000

/** A bare file name only: no separators, no parent references, no control characters, one of the picture types. */
export function safeName(name) {
  if (typeof name !== 'string' || !name || name.length > 255) return null
  if (/[\\/\0]/.test(name) || name === '.' || name === '..' || name.includes('..')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(name)) return null
  if (!TYPES[path.extname(name).toLowerCase()]) return null
  return name
}
export const contentType = (name) => TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream'

/** Pictures in the folder from the last fourteen days, newest first. Pure apart from the file system. */
export function listDir(dir, { now = Date.now(), days = DAYS } = {}) {
  const cutoff = now - days * 86400000
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !safeName(entry.name)) continue
    let st
    try { st = fs.statSync(path.join(dir, entry.name)) } catch { continue }
    const at = st.mtimeMs   // the photo's time, which OneDrive keeps; the creation time is only when it landed here
    if (at < cutoff) continue
    out.push({ name: entry.name, at: new Date(at).toISOString(), size: st.size })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

// ── what was already dealt with ────────────────────────────────────────
let seen = null
function loadSeen() {
  if (seen) return seen
  try { seen = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')) } catch { seen = {} }
  if (!seen.attached) seen.attached = {}
  if (!seen.dismissed) seen.dismissed = {}
  return seen
}
function saveSeen() {
  fs.mkdirSync(path.dirname(SEEN_FILE), { recursive: true })
  const tmp = SEEN_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(seen, null, 2))
  fs.renameSync(tmp, SEEN_FILE)
}
/** Entries older than the window are forgotten, so the file does not grow for years. */
function pruneSeen(now = Date.now()) {
  const s = loadSeen(), cutoff = now - (DAYS + 7) * 86400000
  for (const k of ['attached', 'dismissed']) for (const [name, at] of Object.entries(s[k])) if (new Date(at).getTime() < cutoff) delete s[k][name]
}

// ── the list, refreshed by a poll and by fs.watch when that works ─────
let cache = { at: 0, dir: null, files: [] }
let watcher = null, watchedDir = null

const dirOf = () => String(settings.get().inboxDir || '').trim()

function scan() {
  const dir = dirOf()
  if (!dir) { cache = { at: Date.now(), dir: '', ok: false, reason: 'No folder chosen. Settings > Tools names one.', files: [] }; return cache }
  let files
  try {
    if (!fs.statSync(dir).isDirectory()) throw new Error('not a folder')
    files = listDir(dir)
  } catch (err) {
    cache = { at: Date.now(), dir, ok: false, reason: err.code === 'ENOENT' ? 'The folder is not there right now.' : `Cannot read the folder: ${err.message}.`, files: [] }
    return cache
  }
  const s = loadSeen()
  cache = { at: Date.now(), dir, ok: true, reason: null, files: files.filter(f => !s.attached[f.name] && !s.dismissed[f.name]) }
  return cache
}

function watch() {
  const dir = dirOf()
  if (dir === watchedDir) return
  try { watcher?.close() } catch { /* already gone */ }
  watcher = null; watchedDir = dir
  if (!dir) return
  try {
    watcher = fs.watch(dir, { persistent: false }, () => { clearTimeout(watch.t); watch.t = setTimeout(scan, 800) })
    watcher.on('error', () => { try { watcher.close() } catch { /* ignore */ } watcher = null })
  } catch { /* network drives and some OneDrive folders refuse; the poll covers them */ }
}

let timer = null
/** The poller: every thirty seconds, plus fs.watch when the folder allows it. */
export function start() {
  if (timer) return
  const tick = () => { try { watch(); scan() } catch (err) { console.warn('[inbox]', err.message) } }
  tick()
  timer = setInterval(tick, POLL_MS)
  timer.unref?.()
}
export function stop() { clearInterval(timer); timer = null; try { watcher?.close() } catch { /* ignore */ } watcher = null; watchedDir = null }

/** The list as the UI sees it. A fresh scan when the folder changed or the cache is older than the poll. */
export function list() {
  if (!cache.at || cache.dir !== dirOf() || Date.now() - cache.at > POLL_MS) scan()
  return { dir: cache.dir, ok: cache.ok, reason: cache.reason, files: cache.files.map(f => ({ ...f, url: `/api/inbox/file?name=${encodeURIComponent(f.name)}` })) }
}

const bad = (msg, status = 400) => { const e = new Error(msg); e.status = status; return e }

/** Resolve a name inside the inbox folder, or refuse. */
export function resolveFile(name) {
  const dir = dirOf()
  if (!dir) throw bad('No inbox folder is set.', 404)
  const safe = safeName(name)
  if (!safe) throw bad('Not a picture name I can serve.')
  const full = path.join(dir, safe)
  if (path.dirname(full) !== path.resolve(dir)) throw bad('Not a picture name I can serve.')
  if (!fs.existsSync(full)) throw bad('That picture is not in the folder any more.', 404)
  return full
}

export function attach({ name, taskId, label } = {}) {
  const full = resolveFile(name)
  const task = store.allTasks().find(t => t.id === taskId)
  if (!task) throw bad('No such task.', 404)
  const links = [...(task.links || []), { href: full, label: String(label || '').trim() || name }]
  const updated = store.updateTask(taskId, { links })
  const s = loadSeen(); s.attached[name] = new Date().toISOString(); pruneSeen(); saveSeen()
  scan()
  return { ok: true, task: updated, href: full }
}

export function dismiss({ name } = {}) {
  if (!safeName(name)) throw bad('Not a picture name I know.')
  const s = loadSeen(); s.dismissed[name] = new Date().toISOString(); pruneSeen(); saveSeen()
  scan()
  return { ok: true }
}

export function registerRoutes(app) {
  const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))
  app.get('/api/inbox', wrap((_req, res) => res.json(list())))
  app.get('/api/inbox/file', wrap((req, res) => {
    const full = resolveFile(String(req.query.name || ''))
    res.setHeader('Content-Type', contentType(full))
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.sendFile(full)
  }))
  app.post('/api/inbox/attach', wrap((req, res) => res.json(attach(req.body || {}))))
  app.post('/api/inbox/dismiss', wrap((req, res) => res.json(dismiss(req.body || {}))))
}
