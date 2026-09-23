/**
 * Commissioning playbooks (roadmap 114). A playbook is the standard set of tasks a machine gets when its
 * commissioning starts: titles, lanes, sizes, checklists and order dates as offsets from the day it is
 * applied. Templates live in BENCH_DATA_DIR/playbooks.json next to the board, so a colleague on the same
 * folder has the same ones. One starter ships in code and is used until the file exists.
 *
 *   GET    /api/playbooks                    the templates
 *   POST   /api/playbooks                    create or update one { id?, name, machineType?, tasks }
 *   DELETE /api/playbooks/:id
 *   POST   /api/playbooks/:id/apply          { project } -> { created: [ids] }
 *   POST   /api/playbooks/from-machine       { key, name, machineType? } -> the new template
 *
 * A task meant for Today lands in Active when Today is full: the cap is the board's rule, not the template's.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import * as store from './store.js'
import * as machines from './machines.js'
import { backupOnce } from './backup.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'playbooks.json')
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status })

const LANES = ['today', 'active', 'waiting', 'innovation', 'parked']
const DAY = 86400000
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return localDate(d) }
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / DAY)

/** The one every machine starts from. Ships in code, so a fresh folder is never empty. */
export const STARTER = {
  id: 'commissioning-standard',
  name: 'Commissioning, standard',
  machineType: 'any',
  tasks: [
    { title: 'Incoming inspection', lane: 'active', effortHours: 2, checklist: ['Delivery note against the order', 'Transport damage', 'Serial numbers noted', 'Photos in the inbox'] },
    { title: 'Mechanical assembly check', lane: 'active', effortHours: 4, checklist: ['Torques per the drawing', 'Guards and covers', 'Alignment', 'Lubrication'] },
    { title: 'Electrical check', lane: 'active', effortHours: 3, checklist: ['Wiring against the schematic', 'Earth continuity', 'Insulation', 'Sensor addresses'] },
    { title: 'Safety relay test', lane: 'active', effortHours: 2, checklist: ['E-stop from every station', 'Guard switches', 'Reset behaviour', 'Test protocol signed'] },
    { title: 'Software load', lane: 'active', effortHours: 2, checklist: ['Release version noted', 'Parameters from the type sheet', 'Backup taken'] },
    { title: 'FAT protocol', lane: 'active', effortHours: 4, checklist: ['Dry run', 'Run with material', 'Deviations listed', 'Customer signature'] },
    { title: 'Handover note', lane: 'active', effortHours: 1, checklist: ['Logbook entry', 'Open points to the board', 'Manuals handed over'] }
  ]
}

// ── the file ──────────────────────────────────────────────────────────
function read() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : null
    if (list) return list.map(clean).filter(Boolean)
  } catch { /* first run */ }
  return [structuredClone(STARTER)]
}
function write(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  backupOnce(FILE)
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(list, null, 2), 'utf8')
  fs.renameSync(FILE + '.tmp', FILE)
}

// ── shapes ────────────────────────────────────────────────────────────
const str = v => typeof v === 'string' && v.trim() ? v.trim() : null
/** '+N' means N days after the day the playbook is applied. Anything else is dropped. */
export const offset = v => { const m = /^\+?(\d{1,3})$/.exec(String(v ?? '').trim()); return m ? `+${Number(m[1])}` : null }
export const offsetDays = v => { const o = offset(v); return o ? Number(o.slice(1)) : null }
function cleanTask(t) {
  if (!t || typeof t !== 'object') return null
  const title = str(t.title); if (!title) return null
  const out = { title: title.slice(0, 200), lane: LANES.includes(t.lane) ? t.lane : 'active' }
  const eff = t.effortHours === null || t.effortHours === undefined || t.effortHours === '' ? null : Math.max(0, Number(t.effortHours) || 0)
  if (eff !== null) out.effortHours = eff
  const checklist = Array.isArray(t.checklist) ? t.checklist.map(x => typeof x === 'string' ? x : x?.text).map(x => String(x || '').trim()).filter(Boolean).slice(0, 60)
    : typeof t.checklist === 'string' ? t.checklist.split(/\n/).map(x => x.trim()).filter(Boolean) : []
  if (checklist.length) out.checklist = checklist
  const ob = offset(t.orderBy); if (ob) out.orderBy = ob
  const supplier = str(t.supplier); if (supplier) out.supplier = supplier
  const notes = str(t.notes); if (notes) out.notes = notes.slice(0, 2000)
  return out
}
/** A template as the file keeps it. Null when it has no name or no usable task. */
export function clean(p) {
  if (!p || typeof p !== 'object') return null
  const name = str(p.name); if (!name) return null
  const tasks = (Array.isArray(p.tasks) ? p.tasks : []).map(cleanTask).filter(Boolean).slice(0, 80)
  if (!tasks.length) return null
  return { id: str(p.id) || crypto.randomUUID(), name: name.slice(0, 120), machineType: str(p.machineType) || 'any', tasks }
}

/**
 * The tasks a template makes for a project on a given day, as createTask input. Pure: the Today cap is the
 * store's business, applied in `apply`.
 */
export function tasksFor(template, project, today = localDate()) {
  return template.tasks.map(t => ({
    title: t.title, lane: t.lane || 'active', project: project || null,
    effortHours: t.effortHours ?? null, checklist: t.checklist || [], supplier: t.supplier || null, notes: t.notes || '',
    orderBy: t.orderBy ? addDays(today, offsetDays(t.orderBy)) : null,
    tags: ['playbook']
  }))
}

/**
 * A template from a machine's current tasks: titles, lanes, sizes, checklists (unticked), suppliers, and order
 * dates as offsets from the earliest order-by among them. Done tasks count too; a finished commissioning is
 * exactly what the next one should look like. Tickets from the tools are left out: they are not standard work.
 */
export function templateFrom(tasks, { name, machineType = 'any' } = {}) {
  const own = tasks.filter(t => (t.source || 'local') === 'local' && t.title)
  const dates = own.map(t => t.orderBy).filter(Boolean).map(d => d.slice(0, 10)).sort()
  const first = dates[0] || null
  const out = clean({
    name, machineType,
    tasks: own.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(t => ({
      title: t.title, lane: t.lane === 'today' ? 'today' : LANES.includes(t.lane) ? t.lane : 'active', effortHours: t.effortHours ?? null,
      checklist: (t.checklist || []).map(c => c.text), supplier: t.supplier || null,
      orderBy: t.orderBy && first ? `+${Math.max(0, daysBetween(first, t.orderBy.slice(0, 10)))}` : null
    }))
  })
  if (!out) throw bad('That machine has no tasks of its own to make a template from.')
  return out
}

// ── the API ───────────────────────────────────────────────────────────
export const list = () => read()
export function save(input) {
  const p = clean(input)
  if (!p) throw bad('A playbook needs a name and at least one task with a title.')
  const all = read()
  const i = all.findIndex(x => x.id === p.id)
  if (i >= 0) all[i] = p; else all.push(p)
  write(all)
  return p
}
export function remove(id) {
  const all = read()
  const next = all.filter(x => x.id !== id)
  if (next.length === all.length) return false
  write(next)
  return true
}
/** Create the template's tasks for a project. Today's cap holds: a refused Today task lands in Active. */
export function apply(id, project, today = localDate()) {
  const p = read().find(x => x.id === id)
  if (!p) throw bad('That playbook is gone.', 404)
  const proj = str(project)
  if (!proj) throw bad('Which machine? Give the project name.')
  const created = []
  for (const input of tasksFor(p, proj, today)) {
    let t
    try { t = store.createTask(input) }
    catch (err) { if (err instanceof store.CapError && input.lane === 'today') t = store.createTask({ ...input, lane: 'active' }); else throw err }
    created.push(t.id)
  }
  return { created, project: proj, playbook: { id: p.id, name: p.name } }
}
export function fromMachine({ key, name, machineType } = {}) {
  const m = machines.list().find(x => x.key === machines.resolveKey(key, machines.readAliases().aliases))
  if (!m) throw bad('That machine is not on the list.', 404)
  const ids = new Set(m.tasks)
  const p = templateFrom(store.allTasks().filter(t => ids.has(t.id)), { name: str(name) || `${m.name}, as built`, machineType: str(machineType) || m.name })
  return save(p)
}

export function registerRoutes(app) {
  app.get('/api/playbooks', wrap((_req, res) => res.json(list())))
  app.post('/api/playbooks', wrap((req, res) => res.json(save(req.body || {}))))
  app.post('/api/playbooks/from-machine', wrap((req, res) => res.json(fromMachine(req.body || {}))))
  app.delete('/api/playbooks/:id', wrap((req, res) => res.json({ deleted: remove(req.params.id) })))
  app.post('/api/playbooks/:id/apply', wrap((req, res) => res.json(apply(req.params.id, req.body?.project))))
}
