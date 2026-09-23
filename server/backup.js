/**
 * Daily copies of the shared JSON files. One per file per day, kept 30 days, written the
 * first time a file is saved on a given day. Cheap insurance against a colleague's Bench
 * writing over yours on the share.
 *
 * Roadmap 96 adds the rest of the safety net: a list of what is in backups/, a backup right now,
 * a restore (the current file is copied aside first), and a once-a-day mirror of today's copies
 * to OneDrive under Apps/Bench/backups so a dead share is not the end of the board.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')
const GRAPH = process.env.GRAPH_BASE || 'https://graph.microsoft.com/v1.0'
export const NAMES = ['tasks', 'logbook', 'napkin']
const KEEP_DAYS = 30
const done = new Set()   // `${file}:${date}` already copied this run
const today = () => new Date().toISOString().slice(0, 10)
/** 2026-09-23T11-20-05: sortable, safe in a file name, and the prune still finds the date in it. */
const stamp = (d = new Date()) => d.toISOString().slice(0, 19).replace(/:/g, '-')

export function backupOnce(filePath) {
  try {
    if (!fs.existsSync(filePath)) return
    const date = today()
    const key = `${filePath}:${date}`
    if (done.has(key)) return
    const dir = path.join(path.dirname(filePath), 'backups')
    fs.mkdirSync(dir, { recursive: true })
    const base = path.basename(filePath, '.json')
    const target = path.join(dir, `${base}.${date}.json`)
    if (!fs.existsSync(target)) fs.copyFileSync(filePath, target)
    done.add(key)
    // prune: anything of this file older than 30 days, dated copies and before-restore copies alike
    const cutoff = Date.now() - KEEP_DAYS * 86400000
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith(base + '.')) continue
      const m = /(\d{4}-\d{2}-\d{2})/.exec(f)
      if (m && new Date(m[1]).getTime() < cutoff) fs.rmSync(path.join(dir, f), { force: true })
    }
  } catch (err) { console.warn('[backup]', err.message) }
}

/** Every copy in backups/, newest first: { file, name, date, size, at }. */
export function list() {
  let names = []
  try { names = fs.readdirSync(BACKUP_DIR) } catch { return [] }
  const out = []
  for (const file of names) {
    const m = /^(tasks|logbook|napkin)\.(.+)\.json$/.exec(file)
    if (!m) continue
    let st
    try { st = fs.statSync(path.join(BACKUP_DIR, file)) } catch { continue }
    const date = (/(\d{4}-\d{2}-\d{2})/.exec(m[2]) || [])[1] || st.mtime.toISOString().slice(0, 10)
    out.push({ file, name: m[1], date, size: st.size, at: st.mtime.toISOString(), beforeRestore: m[2].includes('before-restore') })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at) || b.file.localeCompare(a.file))
}

/** A copy of all three files right now, stamped with the time so it sits beside the daily one. */
export function now() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const s = stamp()
  const made = []
  for (const name of NAMES) {
    const src = path.join(DATA_DIR, `${name}.json`)
    if (!fs.existsSync(src)) continue
    const file = `${name}.${s}.json`
    fs.copyFileSync(src, path.join(BACKUP_DIR, file))
    made.push(file)
  }
  return { at: new Date().toISOString(), files: made }
}

/**
 * Put one backup back in place. `file` must be a name from list(), never a path. The current file is
 * kept as <name>.before-restore-<stamp>.json first, then the module that owns the file drops its cache.
 */
export async function restore(file) {
  const entry = list().find(b => b.file === file)
  if (!entry) throw Object.assign(new Error('That backup is not in the list.'), { status: 404 })
  const target = path.join(DATA_DIR, `${entry.name}.json`)
  const src = path.join(BACKUP_DIR, entry.file)
  JSON.parse(fs.readFileSync(src, 'utf8'))   // refuse to restore a copy that does not parse
  let kept = null
  if (fs.existsSync(target)) {
    kept = `${entry.name}.before-restore-${stamp()}.json`
    fs.copyFileSync(target, path.join(BACKUP_DIR, kept))
  }
  fs.copyFileSync(src, target + '.tmp')
  fs.renameSync(target + '.tmp', target)
  if (entry.name === 'tasks') (await import('./store.js')).reload()
  else (await import('./notes.js')).reload()
  try { (await import('./history.js')).reload() } catch { /* the feed is not part of a restore */ }
  return { restored: entry.file, name: entry.name, kept }
}

// ── OneDrive mirror ──────────────────────────────────────────────────
let mirror = { at: null, ok: null, files: [], error: null, date: null }
/** Last mirror run, for the health check ("backup mirror"). ok is null until the first attempt with a token. */
export const mirrorStatus = () => mirror

/**
 * Today's backup files go to /me/drive/root:/Apps/Bench/backups/<file>, once a day. Small files only
 * (the simple upload takes 4 MB); without a token nothing happens and the tick tries again later.
 */
export async function mirrorToOneDrive({ force = false } = {}) {
  const date = today()
  if (!force && mirror.date === date && mirror.ok) return mirror
  // Loaded here, not at the top: the store imports this module and should not drag MSAL in with it.
  const { getTokenSilent } = await import('./auth.js')
  const token = await getTokenSilent('core')
  if (!token) return { ...mirror, skipped: 'needs-signin' }
  const files = list().filter(b => b.date === date && !b.beforeRestore)
  const sent = []
  try {
    for (const b of files) {
      if (b.size > 4 * 1024 * 1024) continue
      const body = fs.readFileSync(path.join(BACKUP_DIR, b.file))
      const url = `${GRAPH}/me/drive/root:/Apps/Bench/backups/${encodeURIComponent(b.file)}:/content`
      const res = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body })
      if (!res.ok) throw new Error(`Graph ${res.status} on ${url.replace(GRAPH, '')} ${(await res.text().catch(() => '')).slice(0, 200)}`)
      sent.push(b.file)
    }
    mirror = { at: new Date().toISOString(), ok: true, files: sent, error: null, date }
  } catch (err) {
    mirror = { at: new Date().toISOString(), ok: false, files: sent, error: err.message, date }
    console.warn('[backup] mirror failed:', err.message)
  }
  return mirror
}

/** Express routes; `wrap` is the server's promise-to-response helper. */
export function registerRoutes(app, wrap) {
  app.get('/api/backups', wrap((_req, res) => res.json({ dir: BACKUP_DIR, files: list(), mirror })))
  app.post('/api/backups/now', wrap((_req, res) => res.json(now())))
  app.post('/api/backups/restore', wrap(async (req, res) => {
    const file = String(req.body?.file || '')
    if (!/^[a-z]+\.[A-Za-z0-9._-]+\.json$/.test(file) || file.includes('/') || file.includes('\\')) return res.status(400).json({ error: 'That is not a backup file name.' })
    res.json(await restore(file))
  }))
}
