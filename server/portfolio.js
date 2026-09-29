/**
 * The innovation portfolio (roadmap 143). Every Planner card whose title carries an I-code is a project; the
 * card's bucket is its stage in the Phase Gate plan, its due date the project's. Nothing is typed into Bench.:
 * the project page gathers what carries the code (your tasks, Logbook entries and their open actions, Napkin
 * maps) and finds the synced Teams folder named after it. Read-only towards Planner.
 *
 *   portfolio(tasks, { today, entries, maps, folders })   pure: the project list
 *   findFolders(codes, roots)                            synced folders whose name carries a code
 *   GET /api/portfolio            { stages, projects }
 *   GET /api/portfolio/:code      one project with its tasks, entries, actions, maps, folder and plan
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as store from './store.js'
import * as notes from './notes.js'
import * as projects from './projects.js'
import { codeOf, mentions, nameOf } from './codes.js'

const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))

/** The stages of the Phase Gate plan, in order, and how a Planner bucket name maps onto them. */
export const STAGES = [
  { key: 'concept', name: 'Concept', de: 'Konzept', re: /konzept|concept/i },
  { key: 'development', name: 'Development', de: 'Entwicklung + Konstruktion', re: /entwicklung|konstruktion|development|construction/i },
  { key: 'procurement', name: 'Procurement', de: 'Beschaffung', re: /beschaffung|procurement/i },
  { key: 'testing', name: 'Testing', de: 'Prüfung', re: /pr(ü|ue)fung|testing/i },
  { key: 'production', name: 'Production', de: 'Produktion', re: /produktion|production/i }
]
/** Index of the stage a bucket stands for, -1 when the bucket is not one of them. */
export const stageOf = bucket => STAGES.findIndex(s => s.re.test(String(bucket || '')))

const day = iso => iso ? String(iso).slice(0, 10) : null
const noon = d => new Date(`${d}T12:00:00`)
const daysBetween = (a, b) => Math.round((noon(b) - noon(a)) / 86400000)
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** The cards, one per code: an open card wins over a done one, then the most recently updated. */
function cardsByCode(tasks) {
  const by = new Map()
  for (const c of tasks.filter(t => t.source === 'planner' && codeOf(t.title))) {
    const code = codeOf(c.title), prev = by.get(code)
    if (!prev || (prev.done && !c.done) || (prev.done === c.done && (c.updatedAt || '') > (prev.updatedAt || ''))) by.set(code, c)
  }
  return by
}
/** What carries the code, apart from its own Planner cards. */
function linked(code, { tasks, entries = [], maps = [] }) {
  const own = tasks.filter(t => !(t.source === 'planner' && codeOf(t.title) === code) && (mentions(t.title, code) || mentions(t.project, code)))
  const log = entries.filter(e => mentions([e.title, e.project, ...(e.tags || []), e.notes].join(' '), code))
  const actions = log.flatMap(e => (e.actions || []).filter(a => !a.done).map(a => ({ id: a.id, text: a.text, owner: a.owner || null, due: a.due || null, entryId: e.id, entryTitle: e.title, entryDate: e.date })))
  return { own, log, actions, maps: maps.filter(m => mentions(m.title, code)) }
}

export function portfolio(tasks, { today = isoToday(), entries = [], maps = [], folders = {} } = {}) {
  return [...cardsByCode(tasks).entries()].map(([code, card]) => {
    const stage = stageOf(card.bucketName)
    const due = day(card.dueDate)
    const l = linked(code, { tasks, entries, maps })
    return {
      code, name: nameOf(card.title, code), title: card.title, cardId: card.id, done: Boolean(card.done), status: card.sourceStatus || null,
      bucket: card.bucketName || null, stage, stageName: stage >= 0 ? STAGES[stage].name : null, plan: card.planTitle || null,
      due, overdue: due && !card.done && due < today ? daysBetween(due, today) : 0,
      open: l.own.filter(t => !t.done).length, closed: l.own.filter(t => t.done).length,
      entries: l.log.length, openActions: l.actions.length, maps: l.maps.length, folder: folders[code] || null
    }
  }).sort((a, b) => (a.done - b.done) || ((b.overdue > 0) - (a.overdue > 0)) || (a.due || '9999').localeCompare(b.due || '9999') || a.code.localeCompare(b.code))
}

// ── the synced Teams folders ──────────────────────────────────────────
/** Folder names inside a folder. OneDrive's synced libraries are reparse points, not plain folders, so stat follows them. */
const subdirs = dir => { let names = []; try { names = fs.readdirSync(dir) } catch { return [] } return names.filter(n => { try { return fs.statSync(path.join(dir, n)).isDirectory() } catch { return false } }) }
/** Where OneDrive puts synced SharePoint and Teams libraries: "OneDrive - tom.fit" and a folder named like the tenant ("tom.fit"). */
export function defaultRoots(home = os.homedir()) {
  return subdirs(home).filter(n => /^OneDrive( - |$)/i.test(n) || /^[a-z0-9-]+\.[a-z]{2,}$/i.test(n)).map(n => path.join(home, n))
}
/** code -> the first folder, one level inside a root, whose name carries the code ("TomFit Oetwil - I-1050 Handgrip strength"). */
export function findFolders(codes, roots = defaultRoots()) {
  const out = {}
  for (const root of roots) {
    const kids = subdirs(root)
    for (const code of codes) if (!out[code]) { const hit = kids.find(k => mentions(k, code)); if (hit) out[code] = path.join(root, hit) }
  }
  return out
}
let folderCache = { at: 0, map: {} }
function foldersSoft(codes) {
  if (Date.now() - folderCache.at < 10 * 60_000 && codes.every(c => c in folderCache.map || folderCache.checked?.has(c))) return folderCache.map
  let map = {}
  try { map = findFolders(codes) } catch { map = {} }
  folderCache = { at: Date.now(), map, checked: new Set(codes) }
  return map
}

// ── what the pages read ───────────────────────────────────────────────
function sources() {
  let entries = [], maps = []
  try { entries = notes.listEntries() } catch { entries = [] }
  try { maps = notes.listMaps() } catch { maps = [] }
  return { tasks: store.allTasks(), entries, maps }
}
export function list(today = isoToday()) {
  const s = sources()
  const codes = [...cardsByCode(s.tasks).keys()]
  return portfolio(s.tasks, { today, entries: s.entries, maps: s.maps, folders: foldersSoft(codes) })
}
export function detail(code, today = isoToday()) {
  const c = codeOf(code); if (!c) return null
  const s = sources()
  const p = portfolio(s.tasks, { today, entries: s.entries, maps: s.maps, folders: foldersSoft([c]) }).find(x => x.code === c)
  if (!p) return null
  const l = linked(c, s)
  const plan = projects.list().find(x => codeOf(x.machine) === c || codeOf(x.name) === c) || null
  return {
    project: p, stages: STAGES.map(({ key, name, de }) => ({ key, name, de })),
    tasks: l.own.map(t => ({ id: t.id, title: t.title, lane: t.lane, done: Boolean(t.done), due: day(t.dueDate), source: t.source })),
    entries: l.log.map(e => ({ id: e.id, title: e.title, date: e.date, decisions: e.decisions || [], openActions: (e.actions || []).filter(a => !a.done).length })),
    actions: l.actions, maps: l.maps.map(m => ({ id: m.id, title: m.title })),
    plan: plan ? { id: plan.id, deadline: plan.deadline, deadlineLabel: plan.deadlineLabel } : null
  }
}

export function registerRoutes(app) {
  app.get('/api/portfolio', wrap((_req, res) => res.json({ stages: STAGES.map(({ key, name, de }) => ({ key, name, de })), projects: list() })))
  app.get('/api/portfolio/:code', wrap((req, res) => { const d = detail(req.params.code); d ? res.json(d) : res.status(404).json({ error: 'not found' }) }))
}
