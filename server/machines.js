/**
 * Machines (roadmap 79). Everything at TomFit hangs on a machine, but the data about one is spread
 * over task.project, the BOM's meta.machine, the Issues list, logbook entries and napkin maps. This
 * module derives one list from all of it, nothing is stored twice: the only file of its own is
 * machines.json with the aliases ("M14" is "Machine 14") and display names the user set.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { allTasks, updateTask } from './store.js'
import { listEntries, listMaps } from './notes.js'
import { backupOnce } from './backup.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'machines.json')

const LANE_ORDER = ['today', 'active', 'waiting', 'innovation', 'parked']
const SOURCES = ['local', 'issues', 'qms', 'bom', 'planner']
const MIN_NAME = 2

// ── Names and keys ────────────────────────────────────────────────────
/** One spelling, tidied: trimmed, inner spaces collapsed. Null when there is nothing left. */
export const cleanName = (v) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  return s.length >= MIN_NAME ? s : null
}
/** The default key: the lower-cased name. The alias map can then say two keys are one machine. */
export const baseKey = (name) => String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
/** Follow the alias map to the canonical key. A loop in the map stops after a few hops. */
export function resolveKey(name, aliases = {}) {
  let k = baseKey(name)
  const seen = new Set()
  while (aliases[k] && !seen.has(k)) { seen.add(k); k = aliases[k] }
  return k
}

const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const day = (v) => typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A word-bounded, case-insensitive match on any of the spellings a machine goes by. */
const mentionRe = (spellings) => {
  const alts = [...new Set(spellings.filter(Boolean))].sort((a, b) => b.length - a.length).map(escapeRe)
  return alts.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, 'iu') : null
}

const isLate = (t, today) => {
  if (t.done) return false
  const due = day(t.dueDate), ob = day(t.orderBy)
  return Boolean((due && due < today) || (ob && ob < today && !t.orderedOn))
}
const isOrder = (t) => !t.done && Boolean(t.orderBy) && !t.orderedOn
const later = (a, b) => (a || '') >= (b || '') ? a : b

/**
 * Derive the machine list. Pure: everything comes in through the argument, so it can be tested with
 * fixtures and run against the live store alike.
 *   tasks    the store's tasks (project, meta.machine, lane, done, dates, source, updatedAt)
 *   entries  logbook entries (project, title, updatedAt or date)
 *   maps     napkin maps (title)
 *   aliases  { '<key>': '<canonical key>' }
 *   names    { '<key>': 'Display name' }
 *   today    'YYYY-MM-DD', for the late count (defaults to the local date)
 */
export function machinesFrom({ tasks = [], entries = [], maps = [], aliases = {}, names = {}, today = localDate() } = {}) {
  const machines = new Map()   // key -> accumulator
  const get = (key) => {
    if (!machines.has(key)) machines.set(key, { key, spellings: new Map(), open: 0, done: 0, late: 0, waiting: 0, orders: 0, issues: 0, qms: 0, bom: 0, logbook: 0, maps: 0, lastActivity: null, tasks: [], taskIds: new Set(), entryIds: new Set() })
    return machines.get(key)
  }
  const spell = (m, raw) => m.spellings.set(raw, (m.spellings.get(raw) || 0) + 1)
  /** The keys one task or entry names, each once, with the spelling it used. */
  const keysOf = (...raws) => {
    const out = new Map()
    for (const raw of raws) { const n = cleanName(raw); if (n) { const k = resolveKey(n, aliases); if (!out.has(k)) out.set(k, n) } }
    return out
  }

  for (const t of tasks) {
    for (const [key, raw] of keysOf(t.project, t.meta?.machine)) {
      const m = get(key)
      spell(m, raw)
      m.tasks.push(t.id); m.taskIds.add(t.id)
      if (t.done) m.done++
      else {
        m.open++
        if (t.lane === 'waiting') m.waiting++
        if (isLate(t, today)) m.late++
        if (isOrder(t)) m.orders++
        if (t.source === 'issues' || t.source === 'qms' || t.source === 'bom') m[t.source]++
      }
      m.lastActivity = later(m.lastActivity, t.updatedAt || t.createdAt)
    }
  }
  for (const e of entries) {
    for (const [key, raw] of keysOf(e.project)) {
      const m = get(key)
      spell(m, raw)
      if (!m.entryIds.has(e.id)) { m.entryIds.add(e.id); m.logbook++ }
      m.lastActivity = later(m.lastActivity, e.updatedAt || e.date)
    }
  }
  // Names the user set count as spellings too, so a mention of the display name is found.
  for (const [key, name] of Object.entries(names)) {
    const n = cleanName(name)
    if (n && machines.has(key)) { const m = machines.get(key); if (!m.spellings.has(n)) m.spellings.set(n, 0) }
  }

  const out = []
  for (const m of machines.values()) {
    const spellings = [...m.spellings.entries()]
    const name = cleanName(names[m.key]) || spellings.sort((a, b) => b[1] - a[1])[0][0]
    const re = mentionRe(spellings.map(([s]) => s))
    // Entries that speak of the machine in their title but file under another project, or none.
    if (re) for (const e of entries) if (!m.entryIds.has(e.id) && re.test(e.title || '')) { m.entryIds.add(e.id); m.logbook++ }
    const mapIds = re ? maps.filter(x => re.test(x.title || '')).map(x => x.id) : []
    out.push({
      key: m.key, name, open: m.open, done: m.done, late: m.late, waiting: m.waiting, orders: m.orders,
      issues: m.issues, qms: m.qms, bom: m.bom, logbook: m.logbook, maps: mapIds.length,
      lastActivity: m.lastActivity, tasks: m.tasks, spellings: spellings.map(([s]) => s), entryIds: [...m.entryIds], mapIds
    })
  }
  out.sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || '') || a.name.localeCompare(b.name))
  return out
}

/** The list as the API sends it: without the working fields the detail needs. */
const publicMachine = ({ spellings: _s, entryIds: _e, mapIds: _m, ...rest }) => rest

/** One machine in full. Pure like machinesFrom; null when the key names nothing. */
export function detailFrom(key, data = {}) {
  const { tasks = [], entries = [], maps = [], aliases = {} } = data
  const k = resolveKey(key, aliases)
  const all = machinesFrom(data)
  const m = all.find(x => x.key === k)
  if (!m) return null
  const mine = new Set(m.tasks)
  const own = tasks.filter(t => mine.has(t.id))
  const byId = new Map(own.map(t => [t.id, t]))
  const grouped = Object.fromEntries(LANE_ORDER.map(l => [l, own.filter(t => !t.done && t.lane === l).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))]))
  grouped.done = own.filter(t => t.done).sort((a, b) => (b.completedAt || b.updatedAt || '').localeCompare(a.completedAt || a.updatedAt || '')).slice(0, 20)
  const bySource = Object.fromEntries(SOURCES.map(s => [s, own.filter(t => !t.done && (t.source || 'local') === s).length]))
  const procurement = own.filter(t => !t.done && (t.orderBy || t.supplier || t.meta?.supplier || t.meta?.orderedOn || t.meta?.deliveryDate))
    .map(t => ({
      id: t.id, title: t.title, supplier: t.supplier || t.meta?.supplier || null, poNumber: t.poNumber || t.meta?.orderNumber || null,
      orderBy: t.orderBy || null, orderedOn: t.orderedOn || t.meta?.orderedOn || null, deliveredOn: t.deliveredOn || t.meta?.deliveredOn || null,
      dueDate: t.dueDate || t.meta?.needBy || null, deliveryDate: t.meta?.deliveryDate || null
    }))
    .sort((a, b) => (a.orderBy || a.dueDate || '9').localeCompare(b.orderBy || b.dueDate || '9'))
  const entryIds = new Set(m.entryIds)
  const ownEntries = entries.filter(e => entryIds.has(e.id)).map(e => ({ id: e.id, title: e.title, date: e.date, project: e.project || null }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const mapIds = new Set(m.mapIds)
  const ownMaps = maps.filter(x => mapIds.has(x.id)).map(x => ({ id: x.id, title: x.title }))
  const re = mentionRe(m.spellings)
  const mentions = re ? tasks.filter(t => !byId.has(t.id) && !t.done && (re.test(t.title || '') || re.test(t.notes || ''))).map(t => ({ id: t.id, title: t.title, project: t.project || null })) : []
  return { machine: publicMachine(m), tasks: grouped, bySource, procurement, entries: ownEntries, maps: ownMaps, mentions }
}

// ── The alias file ────────────────────────────────────────────────────
const EMPTY = { aliases: {}, names: {} }
export function readAliases() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return { aliases: raw?.aliases && typeof raw.aliases === 'object' ? raw.aliases : {}, names: raw?.names && typeof raw.names === 'object' ? raw.names : {} }
  } catch { return structuredClone(EMPTY) }
}
/** Atomic write, like the store: temp file then rename, and yesterday's copy once a day. */
function writeAliases(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  backupOnce(FILE)
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(FILE + '.tmp', FILE)
}

const liveData = () => ({ tasks: allTasks(), entries: listEntries(), maps: listMaps(), ...readAliases() })
export const list = () => machinesFrom(liveData()).map(publicMachine)
export const detail = (key) => detailFrom(key, liveData())

/** Key a counts under key b from now on. Anything that pointed at a follows, so the map stays one hop deep. */
function mergeInto(data, a, b) {
  for (const [k, v] of Object.entries(data.aliases)) if (v === a) data.aliases[k] = b
  data.aliases[a] = b
  if (data.names[a] && !data.names[b]) data.names[b] = data.names[a]
  delete data.names[a]
}

/** "from" is the same machine as "to": from now on everything filed under from counts under to. */
export function alias(from, to) {
  const data = readAliases()
  const a = resolveKey(from, data.aliases), b = resolveKey(to, data.aliases)
  if (!baseKey(from) || !baseKey(to)) throw Object.assign(new Error('Both machines are needed.'), { status: 400 })
  if (a === b) throw Object.assign(new Error('That is already the same machine.'), { status: 400 })
  mergeInto(data, a, b)
  writeAliases(data)
  return { key: b }
}

/**
 * A display name. Its own spelling becomes an alias of the key, so a task that is assigned the new name
 * (or one typed by hand) lands on this machine and not on a second one with the same name.
 */
export function rename(key, name) {
  const data = readAliases()
  const k = resolveKey(key, data.aliases)
  const n = cleanName(name)
  if (!k) throw Object.assign(new Error('Which machine?'), { status: 400 })
  if (!n) throw Object.assign(new Error('A name needs at least two characters.'), { status: 400 })
  data.names[k] = n
  const nk = resolveKey(n, data.aliases)
  if (nk !== k) mergeInto(data, nk, k)
  data.names[k] = n
  writeAliases(data)
  return { key: k, name: n }
}

/** The task gets the machine's display name as its project. */
export function assign(taskId, key) {
  const data = readAliases()
  const k = resolveKey(key, data.aliases)
  const m = machinesFrom(liveData()).find(x => x.key === k)
  if (!m) throw Object.assign(new Error('That machine is not on the list.'), { status: 404 })
  // A hand-edited names map can hold a spelling the alias map does not know yet; make sure it resolves here.
  if (resolveKey(m.name, data.aliases) !== k) { mergeInto(data, resolveKey(m.name, data.aliases), k); writeAliases(data) }
  const t = updateTask(taskId, { project: m.name })
  if (!t) throw Object.assign(new Error('That task is gone.'), { status: 404 })
  return t
}

// ── Routes ────────────────────────────────────────────────────────────
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))

export function registerRoutes(app) {
  app.get('/api/machines', wrap((_req, res) => res.json(list())))
  app.get('/api/machines/:key', wrap((req, res) => {
    const d = detail(req.params.key)
    d ? res.json(d) : res.status(404).json({ error: 'That machine is not on the list.' })
  }))
  app.post('/api/machines/alias', wrap((req, res) => res.json(alias(req.body?.from, req.body?.to))))
  app.post('/api/machines/rename', wrap((req, res) => res.json(rename(req.body?.key, req.body?.name))))
  app.post('/api/machines/assign', wrap((req, res) => res.json({ task: assign(req.body?.taskId, req.body?.key) })))
}
