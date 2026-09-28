/**
 * Projects (roadmap 121 to 125): a goal, a machine, one date that matters, and phases in order between
 * now and then. Tasks join a phase through their `phase` field and a project through their `project`
 * text, the same text the Machines page groups by, so nothing is stored twice.
 *
 *   scheduleBackwards(phases, deadline)   the dates fall out of the deadline and the phase lengths
 *   orderSuggestions(...)                  order-by dates from need-by and the learned lead times
 *   slackOf(...)                           working days of room before the plan breaks
 *   fitOf(...)                             hours per phase against the hours a phase has
 *
 * Working days skip weekends only; Swiss holidays are not known here (say so in the UI).
 */
import crypto from 'node:crypto'
import * as db from './db.js'
import * as store from './store.js'
import * as settings from './settings.js'
import { suggest as suggestLead } from './leadtimes.js'

const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))
const col = db.collection('projects')
const now = () => new Date().toISOString()

// ── working days ──────────────────────────────────────────────────────
const noon = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00')
export const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const weekend = d => d.getDay() === 0 || d.getDay() === 6
/** iso moved by n working days (n may be negative); a weekend start is first moved to the nearest working day in that direction. */
export function addWorkingDays(iso, n) {
  const d = noon(iso)
  const step = n < 0 ? -1 : 1
  while (weekend(d)) d.setDate(d.getDate() + step)
  let left = Math.abs(n)
  while (left > 0) { d.setDate(d.getDate() + step); if (!weekend(d)) left-- }
  return isoOf(d)
}
/** Working days from a to b, both inclusive, negative when b is before a. */
export function workingDaysBetween(a, b) {
  if (!a || !b) return 0
  const from = noon(a), to = noon(b)
  if (to < from) return -workingDaysBetween(b, a)
  let n = 0
  for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) if (!weekend(d)) n++
  return n
}
/** Working days of room from a to b: 0 when they are the same day, negative when b is before a. */
export const gap = (a, b) => b >= a ? workingDaysBetween(a, b) - 1 : -(workingDaysBetween(b, a) - 1)
const lastWorkingDayOnOrBefore = iso => { const d = noon(iso); while (weekend(d)) d.setDate(d.getDate() - 1); return isoOf(d) }

// ── the plan ──────────────────────────────────────────────────────────
export const STARTER_PHASES = [
  { name: 'Design', days: 10 }, { name: 'Procurement', days: 15 }, { name: 'Mechanical assembly', days: 10 },
  { name: 'Electrical', days: 5 }, { name: 'Software', days: 5 }, { name: 'Test', days: 5 }, { name: 'Handover', days: 2 }
]
export const LABELS = ['FAT', 'Delivery', 'Handover', 'Milestone']

/** Walks back from the deadline: the last phase ends on it, every phase before ends the working day before the next starts. */
export function scheduleBackwards(phases, deadline) {
  if (!deadline) return phases.map(p => ({ ...p, start: null, end: null }))
  let end = lastWorkingDayOnOrBefore(deadline)
  const out = []
  for (let i = phases.length - 1; i >= 0; i--) {
    const p = phases[i]
    const days = Math.max(1, Math.round(Number(p.days) || 1))
    const start = addWorkingDays(end, -(days - 1))
    out.unshift({ ...p, days, start, end })
    end = addWorkingDays(start, -1)
  }
  return out
}

/** Tasks of the project: the same text in `project`, case-insensitive. */
const belongs = (t, project) => (t.project || '').trim().toLowerCase() === (project.machine || '').trim().toLowerCase()

/**
 * Parts to order: tasks with a supplier and no order yet. Need-by is the start of the task's phase, or of
 * the first phase after Procurement when the task has none, or the deadline. Order-by comes from the
 * learned lead time (10 working days when the supplier is new).
 */
export function orderSuggestions(project, phases, tasks, suggestFn = suggestLead) {
  const byId = Object.fromEntries(phases.map(p => [p.id, p]))
  const procIdx = phases.findIndex(p => /procure|beschaff|order|bestell/i.test(p.name))
  const fallback = phases[procIdx + 1]?.start || phases[0]?.start || project.deadline
  return tasks.filter(t => belongs(t, project) && !t.done && t.supplier && !t.orderedOn).map(t => {
    const needBy = (t.phase && byId[t.phase]?.start) || t.dueDate?.slice(0, 10) || fallback
    if (!needBy) return null
    const s = suggestFn({ supplier: t.supplier, needBy }, tasks) || {}
    return { taskId: t.id, title: t.title, supplier: t.supplier, phase: t.phase || null, needBy, orderBy: s.orderBy || null, days: s.days ?? null, basis: s.basis || 'default', current: t.orderBy || null }
  }).filter(Boolean)
}

/**
 * Slack: for each phase, working days between the latest due date of its open tasks and the phase end;
 * for the project, the smallest of those, or the days to the deadline when nothing is dated. Negative is late.
 */
export function slackOf(project, phases, tasks, today = isoOf(new Date())) {
  const open = tasks.filter(t => belongs(t, project) && !t.done)
  const perPhase = phases.map(p => {
    const dated = open.filter(t => t.phase === p.id && (t.dueDate || t.orderBy)).map(t => (t.dueDate || t.orderBy).slice(0, 10))
    if (!dated.length || !p.end) return { id: p.id, name: p.name, slack: null }
    const latest = dated.sort().at(-1)
    return { id: p.id, name: p.name, slack: gap(latest, p.end), latest }
  })
  const defined = perPhase.filter(x => x.slack !== null)
  const slack = defined.length ? Math.min(...defined.map(x => x.slack)) : (project.deadline ? gap(today, project.deadline) : null)
  const byId = Object.fromEntries(phases.map(p => [p.id, p]))
  const late = open.filter(t => {
    const due = (t.dueDate || '').slice(0, 10)
    if (!due) return false
    const p = t.phase ? byId[t.phase] : null
    return due < today || (p?.end && due > p.end)
  }).map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate.slice(0, 10), phase: t.phase || null }))
  return { slack, perPhase, late }
}

/** Hours per phase against what the phase can hold: its working days times the workday times the planning share. */
export const PLANNING_SHARE = 0.6   // the part of a workday that goes to planned work; the rest is the bench as it comes
export function fitOf(project, phases, tasks, { workdayHours = 8.4, share = PLANNING_SHARE } = {}) {
  const open = tasks.filter(t => belongs(t, project) && !t.done)
  return phases.map(p => {
    const mine = open.filter(t => t.phase === p.id)
    const hours = mine.reduce((s, t) => s + (Number(t.effortHours) || 0), 0)
    const unsized = mine.filter(t => t.effortHours === null || t.effortHours === undefined || t.effortHours === '').length
    const days = p.start && p.end ? workingDaysBetween(p.start, p.end) : Math.max(1, Number(p.days) || 1)
    const capacity = Math.round(days * workdayHours * share * 10) / 10
    return { id: p.id, name: p.name, hours: Math.round(hours * 10) / 10, unsized, capacity, fits: hours <= capacity }
  })
}

// ── storage ───────────────────────────────────────────────────────────
let cache = null
const load = () => { if (cache) return cache; try { cache = col.exists() ? col.read() : { items: [] } } catch { cache = { items: [] } } if (!Array.isArray(cache.items)) cache.items = []; return cache }
const save = () => col.write(cache)
const clean = (p, input = {}) => {
  const phasesIn = Array.isArray(input.phases) ? input.phases : p.phases
  const phases = (phasesIn || STARTER_PHASES).map((x, i) => ({ id: x.id || crypto.randomUUID(), name: String(x.name || `Phase ${i + 1}`).trim().slice(0, 60), days: Math.max(1, Math.min(200, Math.round(Number(x.days) || 1))), start: x.start || null, end: x.end || null })).slice(0, 20)
  const out = {
    ...p,
    name: String(input.name ?? p.name ?? '').trim().slice(0, 80) || 'Untitled project',
    goal: String(input.goal ?? p.goal ?? '').trim().slice(0, 300),
    machine: String(input.machine ?? p.machine ?? '').trim().slice(0, 80),
    deadline: /^\d{4}-\d{2}-\d{2}/.test(String(input.deadline ?? p.deadline ?? '')) ? String(input.deadline ?? p.deadline).slice(0, 10) : null,
    deadlineLabel: LABELS.includes(input.deadlineLabel ?? p.deadlineLabel) ? (input.deadlineLabel ?? p.deadlineLabel) : 'FAT',
    phases,
    archived: Boolean(input.archived ?? p.archived ?? false),
    updatedAt: now()
  }
  return out
}

export const list = () => load().items.slice().sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'))
export function create(input = {}) {
  const db = load()
  const p = clean({ id: crypto.randomUUID(), createdAt: now(), phases: null }, { ...input, phases: input.phases || STARTER_PHASES })
  if (p.deadline) p.phases = scheduleBackwards(p.phases, p.deadline)
  db.items.push(p); save(); return p
}
export function update(id, patch = {}) {
  const db = load(); const i = db.items.findIndex(x => x.id === id); if (i < 0) return null
  const before = db.items[i]
  const p = clean(before, patch)
  // a new deadline or new phase lengths re-plan; dates typed by hand are kept when nothing else changed
  if (p.deadline && (patch.deadline !== undefined || patch.phases !== undefined)) p.phases = scheduleBackwards(p.phases, p.deadline)
  db.items[i] = p; save(); return p
}
export function remove(id) { const db = load(); const i = db.items.findIndex(x => x.id === id); if (i < 0) return false; db.items.splice(i, 1); save(); return true }
export function reload() { cache = null }

/** One project with everything the page needs. */
export function detail(id, today = isoOf(new Date())) {
  const p = list().find(x => x.id === id); if (!p) return null
  const tasks = store.allTasks()
  const mine = tasks.filter(t => belongs(t, p))
  const phases = p.phases.map(ph => ({ ...ph, tasks: mine.filter(t => t.phase === ph.id) }))
  const known = new Set(p.phases.map(x => x.id))
  return {
    project: p,
    phases,
    unassigned: mine.filter(t => !t.phase || !known.has(t.phase)),
    orders: orderSuggestions(p, p.phases, tasks),
    slack: slackOf(p, p.phases, tasks, today),
    fit: fitOf(p, p.phases, tasks, { workdayHours: Number(settings.get().workdayHours) || 8.4 }),
    today
  }
}

/** The list with one line of numbers per project, for the cards and for the hero. */
export function summaries(today = isoOf(new Date())) {
  const tasks = store.allTasks()
  return list().filter(p => !p.archived).map(p => {
    const mine = tasks.filter(t => belongs(t, p))
    const s = slackOf(p, p.phases, tasks, today)
    const current = p.phases.find(ph => ph.start && ph.end && ph.start <= today && today <= ph.end) || p.phases.find(ph => ph.start && ph.start > today) || null
    return { id: p.id, name: p.name, machine: p.machine, goal: p.goal, deadline: p.deadline, deadlineLabel: p.deadlineLabel, phases: p.phases, open: mine.filter(t => !t.done).length, done: mine.filter(t => t.done).length, slack: s.slack, late: s.late.length, current: current ? current.name : null, daysLeft: p.deadline ? gap(today, p.deadline) : null }
  })
}

/** Re-plan from the deadline and, when asked, write need-by and order-by onto the parts. */
export function schedule(id, { apply = false } = {}) {
  const p = list().find(x => x.id === id); if (!p) return null
  const planned = update(id, { deadline: p.deadline, phases: p.phases })
  const orders = orderSuggestions(planned, planned.phases, store.allTasks())
  let written = 0
  if (apply) for (const o of orders) {
    const t = store.allTasks().find(x => x.id === o.taskId); if (!t) continue
    const patch = {}
    if (o.orderBy && t.orderBy !== o.orderBy) patch.orderBy = o.orderBy
    if (!t.dueDate && o.needBy) patch.dueDate = o.needBy
    if (Object.keys(patch).length) { store.updateTask(t.id, patch); written++ }
  }
  return { project: planned, orders, written }
}

export function registerRoutes(app) {
  app.get('/api/projects', wrap((_req, res) => res.json(summaries())))
  app.post('/api/projects', wrap((req, res) => res.json(create(req.body || {}))))
  app.get('/api/projects/:id', wrap((req, res) => { const d = detail(req.params.id); d ? res.json(d) : res.status(404).json({ error: 'not found' }) }))
  app.patch('/api/projects/:id', wrap((req, res) => { const p = update(req.params.id, req.body || {}); p ? res.json(p) : res.status(404).json({ error: 'not found' }) }))
  app.delete('/api/projects/:id', wrap((req, res) => res.json({ deleted: remove(req.params.id) })))
  app.post('/api/projects/:id/schedule', wrap((req, res) => { const r = schedule(req.params.id, { apply: req.body?.apply === true }); r ? res.json(r) : res.status(404).json({ error: 'not found' }) }))
  app.post('/api/projects/:id/assign', wrap((req, res) => {
    const p = list().find(x => x.id === req.params.id); if (!p) return res.status(404).json({ error: 'not found' })
    const phase = req.body?.phase && p.phases.some(x => x.id === req.body.phase) ? req.body.phase : null
    const t = store.updateTask(String(req.body?.taskId || ''), { phase, project: p.machine })
    t ? res.json({ task: t }) : res.status(404).json({ error: 'no such task' })
  }))
}
