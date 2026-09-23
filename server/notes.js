/**
 * Logbook (meeting notes) and Napkin (mind maps). Two JSON files in the shared data folder,
 * next to tasks.json, so a colleague on the same folder sees the same notes and maps.
 * Same atomic-write discipline as the task store, and the same patience when the folder is away:
 * a save that cannot reach it keeps the state in memory and retries every 30 s and on the next save.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { backupOnce } from './backup.js'
import { isUnreachable, RETRY_MS } from './store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data')
const now = () => new Date().toISOString()

const files = []
function file(name) {
  const p = path.join(DATA_DIR, name)
  let cache = null
  let offline = null   // { since, error, pending } while the folder is away
  const load = () => {
    if (cache) return cache
    try { cache = JSON.parse(fs.readFileSync(p, 'utf8')) } catch { cache = { items: [] } }
    if (!Array.isArray(cache.items)) cache.items = []
    return cache
  }
  const save = () => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true })
      backupOnce(p)
      fs.writeFileSync(p + '.tmp', JSON.stringify(cache, null, 2)); fs.renameSync(p + '.tmp', p)
      if (offline) { console.warn(`[notes] folder is back after ${offline.pending} held write(s) to ${name}`); offline = null }
    } catch (err) {
      if (!isUnreachable(err, DATA_DIR)) throw err
      offline = { since: offline?.since || now(), error: `${err.code || 'error'}: ${err.message}`.slice(0, 300), pending: (offline?.pending || 0) + 1 }
      console.warn(`[notes] folder unreachable, keeping ${name} in memory:`, err.message)
      scheduleRetry()
    }
  }
  const retry = () => { if (!offline) return true; try { save() } catch (err) { console.warn('[notes] retry failed:', err.message) } return !offline }
  const reload = () => {
    if (offline) throw Object.assign(new Error('The shared folder is unreachable; held writes would be lost.'), { status: 409 })
    cache = null; return load()
  }
  const f = { name, load, save, retry, reload, status: () => offline }
  files.push(f)
  return f
}
let retryTimer = null
function scheduleRetry() {
  if (retryTimer) return
  retryTimer = setInterval(() => {
    files.forEach(f => f.retry())
    if (!files.some(f => f.status())) { clearInterval(retryTimer); retryTimer = null }
  }, RETRY_MS)
  retryTimer.unref?.()
}
/** { offline, since, error, pending } across both files, for the health check. */
export function status() {
  const off = files.map(f => f.status()).filter(Boolean)
  if (!off.length) return { offline: false, since: null, error: null, pending: 0 }
  return { offline: true, since: off.map(o => o.since).sort()[0], error: off[0].error, pending: off.reduce((s, o) => s + o.pending, 0) }
}
/** Write held saves now (the timer does this every 30 s). True when nothing is held any more. */
export function retryWrite() { files.forEach(f => f.retry()); return !status().offline }
/** Drop the caches so the next read comes from disk (after a backup restore). */
export function reload() { files.forEach(f => f.reload()) }

// ── Logbook ───────────────────────────────────────────────────────────
const logbook = file('logbook.json')
const ENTRY_FIELDS = ['title', 'date', 'attendees', 'project', 'notes', 'decisions', 'actions', 'tags', 'links']
/** Files and pages that belong to a meeting: a path on the share, a SharePoint link, a drawing. */
const cleanLinks = (v) => Array.isArray(v) ? v.map(l => typeof l === 'string' ? { href: l } : l).map(l => {
  const href = String(l.href || '').trim()
  const label = String(l.label || '').trim() || href.split(/[\\/]/).filter(Boolean).pop() || href
  return { id: l.id || crypto.randomUUID(), href, label: label.slice(0, 120) }
}).filter(l => l.href).slice(0, 40) : []
const strs = (v) => Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : typeof v === 'string' ? v.split(/[,;\n]/).map(x => x.trim()).filter(Boolean) : []
const lines = (v) => Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : typeof v === 'string' ? v.split(/\n/).map(x => x.trim()).filter(Boolean) : []
const cleanActions = (v) => Array.isArray(v) ? v.map(a => ({
  id: a.id || crypto.randomUUID(), text: String(a.text || '').trim(), owner: String(a.owner || '').trim() || null,
  due: a.due || null, done: !!a.done, taskId: a.taskId || null
})).filter(a => a.text) : []

export const listEntries = () => logbook.load().items.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))
export function createEntry(input = {}) {
  const db = logbook.load()
  const e = {
    id: crypto.randomUUID(), title: String(input.title || '').trim() || 'Untitled', date: input.date || now().slice(0, 10),
    attendees: strs(input.attendees), project: String(input.project || '').trim() || null, notes: String(input.notes || ''),
    decisions: lines(input.decisions), actions: cleanActions(input.actions), tags: strs(input.tags), links: cleanLinks(input.links),
    createdAt: now(), updatedAt: now()
  }
  db.items.push(e); logbook.save(); return e
}
export function updateEntry(id, patch = {}) {
  const db = logbook.load(); const e = db.items.find(x => x.id === id); if (!e) return null
  for (const k of ENTRY_FIELDS) if (k in patch) {
    if (k === 'attendees' || k === 'tags') e[k] = strs(patch[k])
    else if (k === 'decisions') e[k] = lines(patch[k])
    else if (k === 'actions') e[k] = cleanActions(patch[k])
    else if (k === 'links') e[k] = cleanLinks(patch[k])
    else if (k === 'title') e[k] = String(patch[k] || '').trim() || 'Untitled'
    else e[k] = typeof patch[k] === 'string' ? patch[k] : (patch[k] ?? null)
  }
  e.updatedAt = now(); logbook.save(); return e
}
export function deleteEntry(id) { const db = logbook.load(); const i = db.items.findIndex(x => x.id === id); if (i < 0) return false; db.items.splice(i, 1); logbook.save(); return true }

// ── Napkin ────────────────────────────────────────────────────────────
const napkin = file('napkin.json')
const COLORS = ['accent', 'rose', 'amber', 'mint', 'sky', 'plum']
function cleanNodes(nodes, root) {
  const out = {}
  for (const [id, n] of Object.entries(nodes || {})) {
    out[id] = { id, text: String(n.text ?? '').slice(0, 400), parent: n.parent ?? null, color: COLORS.includes(n.color) ? n.color : null, collapsed: !!n.collapsed, order: Number(n.order) || 0, taskId: n.taskId || null,
      // hand placement: offset from the automatic layout, inherited by the branch
      dx: Math.max(-5000, Math.min(5000, Number(n.dx) || 0)), dy: Math.max(-5000, Math.min(5000, Number(n.dy) || 0)) }
  }
  if (!out[root]) { const r = crypto.randomUUID(); out[r] = { id: r, text: 'Idea', parent: null, color: null, collapsed: false, order: 0 }; return { nodes: out, root: r } }
  out[root].parent = null
  // drop orphans (parent missing) except the root
  for (const [id, n] of Object.entries(out)) if (id !== root && (!n.parent || !out[n.parent])) delete out[id]
  return { nodes: out, root }
}
export const listMaps = () => napkin.load().items.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
export function createMap(input = {}) {
  const db = napkin.load()
  const root = crypto.randomUUID()
  const m = { id: crypto.randomUUID(), title: String(input.title || '').trim() || 'New map', root, nodes: { [root]: { id: root, text: String(input.title || '').trim() || 'Idea', parent: null, color: null, collapsed: false, order: 0 } }, createdAt: now(), updatedAt: now() }
  db.items.push(m); napkin.save(); return m
}
export function updateMap(id, patch = {}) {
  const db = napkin.load(); const m = db.items.find(x => x.id === id); if (!m) return null
  if ('title' in patch) m.title = String(patch.title || '').trim() || 'Untitled map'
  if ('nodes' in patch) { const c = cleanNodes(patch.nodes, patch.root || m.root); m.nodes = c.nodes; m.root = c.root }
  m.updatedAt = now(); napkin.save(); return m
}
export function deleteMap(id) { const db = napkin.load(); const i = db.items.findIndex(x => x.id === id); if (i < 0) return false; db.items.splice(i, 1); napkin.save(); return true }
