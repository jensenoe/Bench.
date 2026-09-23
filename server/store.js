import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { backupOnce } from './backup.js'
import * as history from './history.js'
import * as db from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Electron sets BENCH_DATA_DIR to a folder next to the executable, so a copy in a
// shared folder is read by whoever opens it. Plain `npm start` keeps ./data.
const DATA_DIR = process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data')
/** The tasks collection through the engine in use (db.js): the tasks.json file unless BENCH_STORAGE says sqlite. */
const col = db.collection('tasks', DATA_DIR)

export const LANES = ['today', 'innovation', 'active', 'waiting', 'parked']
/** Today holds this many open tasks. A sixth has to wait for one to leave. */
export const TODAY_CAP = 5
export const REPEATS = ['daily', 'weekly', 'fortnightly', 'monthly']

const EMPTY = { tasks: [], meta: { lastSync: null, lastSyncError: null, sources: {}, version: 2 } }

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

/** Refused writes carry a status so the API can answer 409 instead of 500. */
export class CapError extends Error { constructor(msg) { super(msg); this.status = 409 } }

let cache = null
let diskMtime = 0            // mtime of tasks.json when we last read or wrote it
let knownIds = new Set()     // task ids that were on disk at that moment (to tell a delete from an add)

/**
 * The shared folder can vanish under us (VPN drops, the share goes away, OneDrive relinks). A save that
 * fails that way keeps the in-memory state, notes it here and retries every 30 s and on the next save.
 * A write is never lost to the folder being away; the worst case is that it lands later (roadmap 77).
 */
const UNREACHABLE = new Set(['ENOENT', 'ENOTDIR', 'EBUSY', 'EPERM', 'EACCES', 'ENETUNREACH', 'EIO', 'ENOTEMPTY', 'EEXIST'])
const isDir = (p) => { try { return fs.statSync(p).isDirectory() } catch { return false } }
/** True when a write failed because the folder cannot be reached, not because the data is wrong. */
export const isUnreachable = (err, dir = DATA_DIR) => Boolean(err && (UNREACHABLE.has(err.code) || !isDir(dir)))
export const RETRY_MS = 30_000
let offline = null           // { since, error, pending } while the folder is away, null otherwise
let retryTimer = null
/** { offline, since, error, pending } for the health check and the UI. */
export function status() { return offline ? { offline: true, ...offline } : { offline: false, since: null, error: null, pending: 0 } }
/** Try the write again now (the timer calls this every 30 s while offline). Returns true when the folder took it. */
export function retryWrite() {
  if (!offline) return true
  try { save() } catch (err) { console.warn('[store] retry failed:', err.message) }
  return !offline
}
function scheduleRetry() {
  if (retryTimer) return
  retryTimer = setInterval(() => { if (!offline) { clearInterval(retryTimer); retryTimer = null; return } retryWrite() }, RETRY_MS)
  retryTimer.unref?.()
}

const mtimeOf = () => col.mtime()
function readDisk() {
  const raw = col.read()
  if (!raw || typeof raw !== 'object') throw new Error('not an object')
  if (!Array.isArray(raw.tasks)) raw.tasks = []
  if (!raw.meta) raw.meta = structuredClone(EMPTY.meta)
  if (!raw.meta.sources) raw.meta.sources = {}
  return raw
}
const remember = (db) => { knownIds = new Set(db.tasks.map(t => t.id)); diskMtime = mtimeOf() }

export function load() {
  // Another Bench on the same shared folder may have written since we last looked.
  if (cache && mtimeOf() !== diskMtime) reconcile()
  if (cache) return cache
  ensureDir()
  if (!col.exists()) {
    cache = structuredClone(EMPTY)
    save()
    return cache
  }
  try {
    cache = readDisk()
    remember(cache)
  } catch (err) {
    // Never lose data to a parse error - move it aside and start clean.
    let bak = null
    try { bak = col.moveAside() } catch (e) { console.error('[store] could not move the unreadable store aside:', e.message) }
    console.error(`[store] ${col.name} unreadable${bak ? `, backed up to ${bak}` : ''}`)
    cache = structuredClone(EMPTY)
    remember(cache)
  }
  return cache
}

/**
 * Two people on one shared folder: fold what is on disk into what we hold, per task,
 * newest updatedAt wins. A task that is only on disk is theirs if we never saw it (keep it) and
 * ours if we knew it (we deleted it: drop). A task that is only ours is new (keep it) unless we knew
 * it from disk and have not touched it since (they deleted it: drop).
 */
function reconcile() {
  let disk
  try { disk = readDisk() } catch { return }   // mid-write by the other side, or the folder is away; try again next time
  const ours = new Map(cache.tasks.map(t => [t.id, t]))
  const theirs = new Map(disk.tasks.map(t => [t.id, t]))
  const merged = []
  for (const [id, t] of theirs) {
    const mine = ours.get(id)
    if (!mine) { if (!knownIds.has(id)) merged.push(t); continue }
    merged.push((mine.updatedAt || '') >= (t.updatedAt || '') ? mine : t)
  }
  for (const [id, t] of ours) {
    if (theirs.has(id)) continue
    if (!knownIds.has(id) || (t.updatedAt || '') > new Date(diskMtime).toISOString()) merged.push(t)
  }
  merged.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const sources = { ...disk.meta.sources }
  for (const [k, v] of Object.entries(cache.meta.sources || {})) {
    if (!sources[k] || (v.lastSync || v.lastAttempt || '') >= (sources[k].lastSync || sources[k].lastAttempt || '')) sources[k] = v
  }
  cache = { ...disk, ...cache, tasks: merged, meta: { ...disk.meta, ...cache.meta, sources } }
  remember({ tasks: disk.tasks })
  diskMtime = mtimeOf()
}

/**
 * Atomic write: temp file + rename, so a crash mid-write cannot truncate the store. When the folder is
 * unreachable the state stays in memory and the write is retried (see `offline` above); any other error
 * is thrown as before.
 */
export function save() {
  if (cache && mtimeOf() !== diskMtime) reconcile()   // returns quietly when the disk cannot be read
  try {
    ensureDir()
    if (col.file) backupOnce(col.file)   // yesterday's state, once a day, before the first write (the JSON files; sqlite is one file)
    col.write(cache)                      // temp file and rename on json, one transaction on sqlite
    remember(cache)
    if (offline) { console.warn(`[store] folder is back after ${offline.pending} held write(s)`); offline = null }
  } catch (err) {
    if (!isUnreachable(err)) throw err
    offline = { since: offline?.since || now(), error: `${err.code || 'error'}: ${err.message}`.slice(0, 300), pending: (offline?.pending || 0) + 1 }
    console.warn('[store] folder unreachable, keeping the write in memory:', err.message)
    scheduleRetry()
  }
}

/** Drop the caches so the next read comes from disk (after a backup restore). Refused while writes are held. */
export function reload() {
  if (offline) throw Object.assign(new Error('The shared folder is unreachable; held writes would be lost.'), { status: 409 })
  cache = null; diskMtime = 0; knownIds = new Set()
  return load()
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
 *   checklist    steps inside the task, [{ id, text, done }]
 *   repeat       null, daily, weekly, fortnightly or monthly: completing it creates the next one
 *   supplier, poNumber, orderedOn   the procurement side of a part with a lead time
 *   deliveredOn  the day the part arrived; with orderedOn it is one lead-time sample for the supplier
 *   links        files and pages that belong to the task, [{ id, href, label }], photographs included
 */
export const OWN_FIELDS = ['assignedBy', 'lead', 'project', 'priority', 'effortHours', 'tags', 'checklist', 'repeat', 'supplier', 'poNumber', 'orderedOn', 'deliveredOn', 'links']
const clampPrio = p => (p === null || p === undefined || p === '') ? null : Math.min(3, Math.max(1, Number(p) || 3))
const normTags = t => Array.isArray(t) ? [...new Set(t.map(x => String(x).trim()).filter(Boolean))].slice(0, 12)
  : typeof t === 'string' ? normTags(t.split(/[,;]/)) : []
const normChecklist = c => Array.isArray(c) ? c.map(x => typeof x === 'string' ? { text: x } : x)
  .map(x => ({ id: x.id || crypto.randomUUID(), text: String(x.text || '').trim().slice(0, 300), done: !!x.done })).filter(x => x.text).slice(0, 60)
  : typeof c === 'string' ? normChecklist(c.split(/\n/)) : []
const normRepeat = r => REPEATS.includes(r) ? r : null
const str = v => (typeof v === 'string' && v.trim()) ? v.trim() : null
const dateStr = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null
/** Same shape and cleaning as the logbook's links: a path, a page or a picture, with a label. */
export const cleanLinks = (v) => Array.isArray(v) ? v.map(l => typeof l === 'string' ? { href: l } : (l || {})).map(l => {
  const href = String(l.href || '').trim()
  const label = String(l.label || '').trim() || href.split(/[\\/]/).filter(Boolean).pop() || href
  return { id: l.id || crypto.randomUUID(), href, label: label.slice(0, 120) }
}).filter(l => l.href).slice(0, 40) : []
const ownFields = (input = {}) => ({
  assignedBy: str(input.assignedBy),
  lead: str(input.lead),
  project: str(input.project),
  priority: clampPrio(input.priority),
  effortHours: input.effortHours === null || input.effortHours === undefined || input.effortHours === '' ? null : Math.max(0, Number(input.effortHours) || 0),
  tags: normTags(input.tags),
  checklist: normChecklist(input.checklist),
  repeat: normRepeat(input.repeat),
  supplier: str(input.supplier),
  poNumber: str(input.poNumber),
  orderedOn: dateStr(input.orderedOn),
  deliveredOn: dateStr(input.deliveredOn),
  links: cleanLinks(input.links)
})

export function allTasks() {
  return load().tasks
}

/** Open tasks on Today, not counting one particular id. */
const todayCount = (db, exceptId = null) => db.tasks.filter(t => t.lane === 'today' && !t.done && t.id !== exceptId).length
function assertRoom(db, exceptId = null) {
  if (todayCount(db, exceptId) >= TODAY_CAP) throw new CapError(`Today is full. Five is the rule; move something out before this comes in.`)
}

export function createTask(input) {
  const db = load()
  const lane = LANES.includes(input.lane) ? input.lane : 'active'
  if (lane === 'today') assertRoom(db)
  const task = {
    id: crypto.randomUUID(),
    source: 'local',
    plannerId: null,
    title: (input.title || '').trim(),
    notes: input.notes || '',
    lane,
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
  history.record('created', null, task)
  return task
}

/**
 * Put a task back exactly as it was (undo of a delete). The id stays so links to it keep working; a
 * task with that id already on the board is left alone.
 */
export function restoreTask(snapshot) {
  const db = load()
  if (!snapshot?.id || !snapshot.title) return null
  const existing = db.tasks.find(x => x.id === snapshot.id)
  if (existing) return existing
  const task = structuredClone(snapshot)
  if (task.lane === 'today' && !task.done) assertRoom(db)
  task.updatedAt = now(); task.lastTouched = now()
  db.tasks.push(task)
  save()
  history.record('created', null, task)
  return task
}

const addDays = (iso, n) => { const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const addMonths = (iso, n) => { const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10) }
/** The next date for a repeating task: from its due date, or from today when it has none. */
export function nextOccurrence(repeat, from = null) {
  const base = from || new Date().toISOString().slice(0, 10)
  if (repeat === 'daily') return addDays(base, 1)
  if (repeat === 'weekly') return addDays(base, 7)
  if (repeat === 'fortnightly') return addDays(base, 14)
  if (repeat === 'monthly') return addMonths(base, 1)
  return null
}

/** Completing a repeating task leaves the next one behind, in the same lane, checklist unticked. */
function spawnNext(db, t) {
  const due = nextOccurrence(t.repeat, t.dueDate)
  const next = {
    ...structuredClone(t),
    id: crypto.randomUUID(), done: false, completedAt: null, completedBy: undefined,
    dueDate: due, orderBy: t.orderBy ? nextOccurrence(t.repeat, t.orderBy) : null,
    checklist: (t.checklist || []).map(c => ({ ...c, id: crypto.randomUUID(), done: false })),
    waitingSince: t.lane === 'waiting' ? now() : null,
    createdAt: now(), updatedAt: now(), lastTouched: now(), order: db.tasks.length,
    repeatOf: t.id
  }
  delete next.completedBy
  // Today is capped; a repeat that would overflow it waits in Active.
  if (next.lane === 'today' && todayCount(db) >= TODAY_CAP) next.lane = 'active'
  db.tasks.push(next)
  return next
}

export function updateTask(id, patch) {
  const db = load()
  const t = db.tasks.find(x => x.id === id)
  if (!t) return null
  const before = structuredClone(t)

  const lane = patch.lane && LANES.includes(patch.lane) ? patch.lane : t.lane
  const willBeOpen = patch.done === false || (patch.done !== true && !t.done)
  if (lane === 'today' && willBeOpen && (lane !== t.lane || (patch.done === false && t.done))) assertRoom(db, id)

  // Entering the waiting lane starts the clock; leaving it stops.
  if (patch.lane && patch.lane !== t.lane) {
    if (patch.lane === 'waiting' && !t.waitingSince) patch.waitingSince = now()
    if (patch.lane !== 'waiting') patch.waitingSince = null
  }
  let spawned = null
  if (patch.done === true && !t.done) {
    patch.completedAt = now(); patch.completedBy = 'local'
    if (t.repeat) spawned = spawnNext(db, t)
  }
  if (patch.done === false) patch.completedAt = null

  const allowed = ['title', 'notes', 'lane', 'done', 'dueDate', 'leadTimeDays',
    'orderBy', 'waitingOn', 'waitingSince', 'completedAt', 'completedBy', 'order',
    ...OWN_FIELDS]
  for (const k of allowed) if (k in patch) t[k] = patch[k]
  if ('lane' in patch) t.lane = lane
  if ('priority' in patch) t.priority = clampPrio(patch.priority)
  if ('effortHours' in patch) t.effortHours = patch.effortHours === null || patch.effortHours === '' ? null : Math.max(0, Number(patch.effortHours) || 0)
  if ('tags' in patch) t.tags = normTags(patch.tags)
  if ('checklist' in patch) t.checklist = normChecklist(patch.checklist)
  if ('repeat' in patch) t.repeat = normRepeat(patch.repeat)
  for (const k of ['supplier', 'poNumber']) if (k in patch) t[k] = str(patch[k])
  if ('orderedOn' in patch) t.orderedOn = dateStr(patch.orderedOn)
  if ('deliveredOn' in patch) t.deliveredOn = dateStr(patch.deliveredOn)
  if ('links' in patch) t.links = cleanLinks(patch.links)

  t.updatedAt = now()
  t.lastTouched = now()
  save()
  history.record('changed', before, t)
  return spawned ? { ...t, spawned } : t
}

export function deleteTask(id) {
  const db = load()
  const i = db.tasks.findIndex(x => x.id === id)
  if (i === -1) return false
  const [gone] = db.tasks.splice(i, 1)
  save()
  history.record('deleted', gone, null)
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
  const events = []

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
      events.push({ before: null, after: db.tasks.at(-1) })
      added++
    }
  }
  // Gone upstream means finished or reassigned. Either way it leaves the open board.
  for (const t of db.tasks) {
    if (t.source === source && !t.done && !seen.has(t.sourceId)) {
      const before = structuredClone(t)
      t.done = true; t.completedAt = now(); closed++
      events.push({ before, after: t })
    }
  }
  db.meta.sources[source] = { ...(db.meta.sources[source] || {}), lastSync: now(), count: remote.length, error: null }
  save()
  for (const e of events) history.record('synced', e.before, e.after, { who: source })
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
