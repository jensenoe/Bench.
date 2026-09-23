/**
 * Change feed (roadmap 87). Every create, edit, delete and every task a sync adds or closes lands here
 * as one entry, newest first, with the task as it was before, so an edit or a delete can be undone.
 * One JSON file in the shared data folder, capped at 2000 entries, written like the store: temp file
 * plus rename. The store calls record(); nothing here calls the store at import time, so the two
 * modules can lean on each other without a cycle.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import * as settings from './settings.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'history.json')
export const CAP = 2000
const now = () => new Date().toISOString()

/** Fields that change on their own with every save, or that only mean "reordered": not worth an entry. */
const IGNORE = new Set(['updatedAt', 'lastTouched', 'order', 'waitingSince', 'completedAt', 'completedBy', 'meta', 'sourceStatus', 'url'])
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

let cache = null
function load() {
  if (cache) return cache
  try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { cache = { entries: [] } }
  if (!Array.isArray(cache.entries)) cache.entries = []
  return cache
}
function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(cache, null, 2))
    fs.renameSync(FILE + '.tmp', FILE)
  } catch (err) { console.warn('[history] not written, kept in memory:', err.message) }   // the folder is away; the next record tries again
}
/** Drop the cache so the next read comes from disk (after a backup restore). */
export function reload() { cache = null; return load() }

/** What changed between two versions of a task, as [{ field, from, to }]. */
export function diff(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
  const out = []
  for (const k of keys) {
    if (IGNORE.has(k)) continue
    if (!same(before?.[k], after?.[k])) out.push({ field: k, from: before?.[k] ?? null, to: after?.[k] ?? null })
  }
  return out
}

/**
 * kind: created (after only), changed (both), deleted (before only), synced (a source added or closed it).
 * The entry keeps the task as it was before, which is what an undo puts back.
 */
export function record(kind, before, after, { who = null } = {}) {
  const changes = kind === 'changed' || kind === 'synced' ? diff(before, after) : []
  if (kind === 'changed' && !changes.length) return null
  const task = after || before
  const entry = {
    id: crypto.randomUUID(),
    at: now(),
    who: who || settings.get().name || 'someone',
    taskId: task?.id || null,
    title: task?.title || '',
    kind,
    changes,
    snapshot: before ? structuredClone(before) : null,
    undoneAt: null
  }
  const db = load()
  db.entries.unshift(entry)
  if (db.entries.length > CAP) db.entries.length = CAP
  save()
  return entry
}

export function list(limit = 50) {
  const n = Math.max(1, Math.min(CAP, Number(limit) || 50))
  return load().entries.slice(0, n)
}

export const undoable = (e) => Boolean(e && !e.undoneAt && ['created', 'changed', 'deleted'].includes(e.kind))

/**
 * Undo one entry: an edit puts the old values back, a delete recreates the task with its id, a create
 * deletes it again. Each of those goes through the store, so the undo is itself an entry (and can be undone).
 */
export async function undo(id) {
  const db = load()
  const e = db.entries.find(x => x.id === id)
  if (!e) throw Object.assign(new Error('That change is not in the feed any more.'), { status: 404 })
  if (e.kind === 'synced') throw Object.assign(new Error('That came from a sync; change it in the source tool.'), { status: 400 })
  if (e.undoneAt) throw Object.assign(new Error('That change was already undone.'), { status: 409 })
  const store = await import('./store.js')
  let task = null
  if (e.kind === 'changed') {
    if (!store.allTasks().some(t => t.id === e.taskId)) throw Object.assign(new Error('The task is gone; undo its deletion first.'), { status: 409 })
    task = store.updateTask(e.taskId, Object.fromEntries(e.changes.map(c => [c.field, c.from])))
  } else if (e.kind === 'deleted') {
    task = store.restoreTask(e.snapshot)
  } else if (e.kind === 'created') {
    store.deleteTask(e.taskId)
  }
  e.undoneAt = now()
  save()
  return { entry: e, task }
}

/** Express routes; `wrap` is the server's promise-to-response helper. */
export function registerRoutes(app, wrap) {
  app.get('/api/history', wrap((req, res) => res.json(list(req.query.limit))))
  app.post('/api/history/:id/undo', wrap(async (req, res) => res.json(await undo(req.params.id))))
}
