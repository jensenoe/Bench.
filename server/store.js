import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { backupOnce } from './backup.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Electron sets BENCH_DATA_DIR to a folder next to the executable, so a copy in a
// shared folder is read by whoever opens it. Plain `npm start` keeps ./data.
const DATA_DIR = process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data')
const DB_FILE = path.join(DATA_DIR, 'tasks.json')

export const LANES = ['today', 'innovation', 'active', 'waiting', 'parked']

const EMPTY = { tasks: [], meta: { lastSync: null, lastSyncError: null, sources: {}, version: 2 } }

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

let cache = null

export function load() {
  if (cache) return cache
  ensureDir()
  if (!fs.existsSync(DB_FILE)) {
    cache = structuredClone(EMPTY)
    save()
    return cache
  }
  try {
    cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
    if (!cache || typeof cache !== 'object') cache = structuredClone(EMPTY)
    if (!Array.isArray(cache.tasks)) cache.tasks = []
    if (!cache.meta) cache.meta = structuredClone(EMPTY.meta)
    if (!cache.meta.sources) cache.meta.sources = {}
  } catch (err) {
    // Never lose data to a parse error - move it aside and start clean.
    const bak = DB_FILE + '.corrupt-' + Date.now()
    fs.copyFileSync(DB_FILE, bak)
    console.error(`[store] tasks.json unreadable, backed up to ${bak}`)
    cache = structuredClone(EMPTY)
  }
  return cache
}

/** Atomic write: temp file + rename, so a crash mid-write cannot truncate the store. */
export function save() {
  ensureDir()
  backupOnce(DB_FILE)   // yesterday's state, once a day, before the first write
  const tmp = DB_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8')
  fs.renameSync(tmp, DB_FILE)
}

const now = () => new Date().toISOString()

/**
 * Fields that belong to this board, whatever the source says:
 *   assignedBy   who handed it over (a source may suggest one in meta.from; this wins once set)
 *   lead         who carries it, when that is not you
 *   project      machine, build or programme it belongs to
 *   priority     1 (now), 2 (this week), 3 (when there is room), or null
 *   effortHours  rough size, for planning a day
 *   tags         free labels
 */
export const OWN_FIELDS = ['assignedBy', 'lead', 'project', 'priority', 'effortHours', 'tags']
const clampPrio = p => (p === null || p === undefined || p === '') ? null : Math.min(3, Math.max(1, Number(p) || 3))
const normTags = t => Array.isArray(t) ? [...new Set(t.map(x => String(x).trim()).filter(Boolean))].slice(0, 12)
  : typeof t === 'string' ? normTags(t.split(/[,;]/)) : []
const ownFields = (input = {}) => ({
  assignedBy: input.assignedBy?.trim() || null,
  lead: input.lead?.trim() || null,
  project: input.project?.trim() || null,
  priority: clampPrio(input.priority),
  effortHours: input.effortHours === null || input.effortHours === undefined || input.effortHours === '' ? null : Math.max(0, Number(input.effortHours) || 0),
  tags: normTags(input.tags)
})

export function allTasks() {
  return load().tasks
}

export function createTask(input) {
  const db = load()
  const task = {
    id: crypto.randomUUID(),
    source: 'local',
    plannerId: null,
    title: (input.title || '').trim(),
    notes: input.notes || '',
    lane: LANES.includes(input.lane) ? input.lane : 'active',
    done: false,
    dueDate: input.dueDate || null,
    leadTimeDays: input.leadTimeDays ?? null,
    orderBy: input.orderBy || null,
    waitingOn: input.waitingOn || null,
    waitingSince: input.lane === 'waiting' ? now() : null,
    ...ownFields(input),
    planTitle: null,
    bucketName: null,
    createdAt: now(),
    updatedAt: now(),
    lastTouched: now(),
    completedAt: null,
    order: db.tasks.length
  }
  db.tasks.push(task)
  save()
  return task
}

export function updateTask(id, patch) {
  const db = load()
  const t = db.tasks.find(x => x.id === id)
  if (!t) return null

  // Entering the waiting lane starts the clock; leaving it stops.
  if (patch.lane && patch.lane !== t.lane) {
    if (patch.lane === 'waiting' && !t.waitingSince) patch.waitingSince = now()
    if (patch.lane !== 'waiting') patch.waitingSince = null
  }
  if (patch.done === true && !t.done) { patch.completedAt = now(); patch.completedBy = 'local' }
  if (patch.done === false) patch.completedAt = null

  const allowed = ['title', 'notes', 'lane', 'done', 'dueDate', 'leadTimeDays',
    'orderBy', 'waitingOn', 'waitingSince', 'completedAt', 'completedBy', 'order',
    ...OWN_FIELDS]
  for (const k of allowed) if (k in patch) t[k] = patch[k]
  if ('priority' in patch) t.priority = clampPrio(patch.priority)
  if ('effortHours' in patch) t.effortHours = patch.effortHours === null || patch.effortHours === '' ? null : Math.max(0, Number(patch.effortHours) || 0)
  if ('tags' in patch) t.tags = normTags(patch.tags)

  t.updatedAt = now()
  t.lastTouched = now()
  save()
  return t
}

export function deleteTask(id) {
  const db = load()
  const i = db.tasks.findIndex(x => x.id === id)
  if (i === -1) return false
  db.tasks.splice(i, 1)
  save()
  return true
}

export function getMeta() { return load().meta }

export function setMeta(patch) {
  const db = load()
  Object.assign(db.meta, patch)
  save()
  return db.meta
}

/**
 * Merge one source's items into the store.
 * The source owns: title, due date, done, status, url, meta.
 * We own, and never overwrite: lane, notes, order-by, waiting-on.
 * That split is what keeps this from becoming a second place to type things.
 */
export function mergeSource(source, remote) {
  const db = load()
  const seen = new Set()
  let added = 0, updated = 0, closed = 0

  for (const r of remote) {
    seen.add(r.sourceId)
    const existing = db.tasks.find(t => t.source === source && t.sourceId === r.sourceId)
    if (existing) {
      Object.assign(existing, {
        title: r.title, dueDate: r.dueDate ?? null, url: r.url ?? null,
        planTitle: r.group ?? null, bucketName: r.subgroup ?? null,
        sourceStatus: r.status ?? null, meta: r.meta ?? {}, updatedAt: now()
      })
      if (r.done && !existing.done) { existing.done = true; existing.completedAt = now() }
      if (!r.done && existing.done && existing.completedBy !== 'local') { existing.done = false; existing.completedAt = null }
      updated++
    } else {
      db.tasks.push({
        id: crypto.randomUUID(), source, sourceId: r.sourceId, plannerId: source === 'planner' ? r.sourceId : null,
        title: r.title, notes: '', lane: inferLane(r), done: !!r.done,
        dueDate: r.dueDate ?? null, leadTimeDays: null, orderBy: null, waitingOn: null, waitingSince: null,
        ...ownFields({}),
        planTitle: r.group ?? null, bucketName: r.subgroup ?? null, url: r.url ?? null,
        sourceStatus: r.status ?? null, meta: r.meta ?? {},
        createdAt: now(), updatedAt: now(), lastTouched: now(), completedAt: r.done ? now() : null,
        order: db.tasks.length
      })
      added++
    }
  }
  // Gone upstream means finished or reassigned. Either way it leaves the open board.
  for (const t of db.tasks) {
    if (t.source === source && !t.done && !seen.has(t.sourceId)) { t.done = true; t.completedAt = now(); closed++ }
  }
  db.meta.sources[source] = { lastSync: now(), count: remote.length, error: null }
  save()
  return { added, updated, closed }
}

export function patchSource(source, patch) {
  const db = load()
  db.meta.sources[source] = { ...(db.meta.sources[source] || {}), ...patch }
  save()
}

export function noteSourceError(source, error) {
  const db = load()
  db.meta.sources[source] = { ...(db.meta.sources[source] || {}), error, lastAttempt: now() }
  save()
}

/** Kept for the existing Planner path. */
export const mergePlannerTasks = (remote) =>
  mergeSource('planner', remote.map(r => ({ sourceId: r.plannerId, title: r.title, dueDate: r.dueDate, done: r.done, group: r.planTitle, subgroup: r.bucketName, status: r.done ? 'done' : 'open', url: null })))

function inferLane(r) {
  if (!r.dueDate) return 'active'
  const due = new Date(r.dueDate)
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  return due <= endOfToday ? 'today' : 'active'
}
