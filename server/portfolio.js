/**
 * The innovation portfolio (roadmap 143). Every Planner card whose title carries an I-code is a project; the
 * card's bucket is its stage in the Phase Gate plan, its due date the project's. Nothing is typed into Bench.:
 * the project page gathers what carries the code (your tasks, Logbook entries and their open actions, Napkin
 * maps) and finds the synced Teams folder named after it. Read-only towards Planner.
 *
 * Stage history (roadmap 162): Bench. only sees a card's current bucket, so the store records every bucket a
 * Planner sync changes in the change feed (history.js), and the moves are read back from there. No storage
 * of its own; what the feed has trimmed away is simply not known.
 *
 *   portfolio(tasks, { today, entries, maps, folders, feed })   pure: the project list
 *   stageTrail(feed, cardId), stageSince(trail, bucket)        pure: a card's moves and since when it sits where it is
 *   needsAttention(list)                                        pure: overdue, stuck in a stage, actions left open
 *   summary(list, { today, entries })                           pure: the last 30 days in numbers, moves and decisions
 *   findFolders(codes, roots)                                   synced folders whose name carries a code
 *   GET /api/portfolio            { stages, projects, summary }
 *   GET /api/portfolio/:code      one project with its tasks, entries, actions, maps, folder and plan
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as store from './store.js'
import * as notes from './notes.js'
import * as projects from './projects.js'
import * as history from './history.js'
import { CODE_RE, codeOf, mentions, nameOf } from './codes.js'

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

/** How long a project may sit in one stage, and a Logbook action stay open, before the report names it. */
export const STUCK_DAYS = 60
export const STALE_ACTION_DAYS = 14
/** "This month" is the last 30 days, today included. */
export const MONTH_DAYS = 30

const day = iso => iso ? String(iso).slice(0, 10) : null
const noon = d => new Date(`${d}T12:00:00`)
const daysBetween = (a, b) => Math.round((noon(b) - noon(a)) / 86400000)
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const isoToday = () => isoOf(new Date())
const addDays = (iso, n) => { const d = noon(iso); d.setDate(d.getDate() + n); return isoOf(d) }
/** The local calendar day of a feed timestamp: a sync at 23:30 UTC in summer belongs to the next day in Zurich. */
const localDay = at => { const d = new Date(at); return Number.isNaN(d.getTime()) ? day(at) : isoOf(d) }
const blank = v => v === null || v === undefined || v === ''

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

// ── stage history, from the change feed ───────────────────────────────
/** A bucket as the stage it stands for, or the bucket's own name when it is not one of the five. */
const stageLabel = bucket => { const i = stageOf(bucket); return i >= 0 ? STAGES[i].name : String(bucket) }

/**
 * A card's way through the stages: every feed entry of the card that changed its bucket, oldest first. The
 * first bucket a sync saw (from nothing to a bucket) is not a move but the first sighting, a lower bound for
 * how long the card has sat there. A renamed bucket that stays the same stage is no move.
 * { moves: [{ date, at, from, to, fromStage, toStage, fromBucket, toBucket }], seen: { date, bucket } | null }
 */
export function stageTrail(feed = [], cardId) {
  const mine = feed.filter(e => e && e.taskId === cardId && e.at && Array.isArray(e.changes)).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)))
  const moves = []
  let seen = null
  for (const e of mine) {
    const c = e.changes.find(x => x.field === 'bucketName')
    if (!c || blank(c.to)) continue
    if (blank(c.from)) { if (!seen) seen = { date: localDay(e.at), bucket: c.to }; continue }
    const fromStage = stageOf(c.from), toStage = stageOf(c.to)
    if (fromStage === toStage && (fromStage >= 0 || c.from === c.to)) continue
    moves.push({ date: localDay(e.at), at: e.at, from: stageLabel(c.from), to: stageLabel(c.to), fromStage, toStage, fromBucket: c.from, toBucket: c.to })
  }
  return { moves, seen }
}

/**
 * Since when the card sits in its bucket: the day of the last move into it (exact), or failing that the day a
 * sync first saw it there (a lower bound: it may have sat there before Bench. looked). Null when neither is known,
 * as when the last move the feed kept went somewhere else.
 */
export function stageSince(trail, bucket) {
  const here = stageOf(bucket)
  const same = b => here >= 0 ? stageOf(b) === here : b === bucket
  const last = trail.moves.at(-1)
  if (last) return same(last.toBucket) ? { date: last.date, exact: true } : null
  if (trail.seen && same(trail.seen.bucket)) return { date: trail.seen.date, exact: false }
  return null
}

export function portfolio(tasks, { today = isoToday(), entries = [], maps = [], folders = {}, feed = [] } = {}) {
  const byCard = new Map()
  for (const e of feed) {
    if (!e?.taskId || !e.changes?.some(c => c.field === 'bucketName')) continue
    if (!byCard.has(e.taskId)) byCard.set(e.taskId, [])
    byCard.get(e.taskId).push(e)
  }
  const staleBefore = addDays(today, -STALE_ACTION_DAYS)
  return [...cardsByCode(tasks).entries()].map(([code, card]) => {
    const stage = stageOf(card.bucketName)
    const due = day(card.dueDate)
    const l = linked(code, { tasks, entries, maps })
    const trail = stageTrail(byCard.get(card.id) || [], card.id)
    const since = stageSince(trail, card.bucketName)
    const actionDays = l.actions.map(a => day(a.entryDate)).filter(Boolean).sort()
    return {
      code, name: nameOf(card.title, code), title: card.title, cardId: card.id, done: Boolean(card.done), status: card.sourceStatus || null,
      bucket: card.bucketName || null, stage, stageName: stage >= 0 ? STAGES[stage].name : null, plan: card.planTitle || null,
      due, overdue: due && !card.done && due < today ? daysBetween(due, today) : 0, daysToDue: due ? daysBetween(today, due) : null,
      open: l.own.filter(t => !t.done).length, closed: l.own.filter(t => t.done).length,
      entries: l.log.length, openActions: l.actions.length, maps: l.maps.length, folder: folders[code] || null,
      stageSince: since?.date || null, stageSinceExact: Boolean(since?.exact), daysInStage: since ? Math.max(0, daysBetween(since.date, today)) : null,
      moves: trail.moves.map(({ date, from, to, fromStage, toStage }) => ({ date, from, to, fromStage, toStage })),
      oldestAction: actionDays[0] || null, staleActions: actionDays.filter(d => d < staleBefore).length
    }
  }).sort((a, b) => (a.done - b.done) || ((b.overdue > 0) - (a.overdue > 0)) || (a.due || '9999').localeCompare(b.due || '9999') || a.code.localeCompare(b.code))
}

/**
 * What a manager should look at, per open project: past its due date, in one stage for STUCK_DAYS or more (a
 * lower bound counts: at least that long), Logbook actions open for more than STALE_ACTION_DAYS.
 * [{ code, name, stageName, overdue, daysInStage, reasons: [{ kind: 'overdue' | 'stuck' | 'actions', text }] }],
 * the latest first.
 */
export function needsAttention(list) {
  const out = []
  for (const p of list) {
    if (p.done) continue
    const reasons = []
    if (p.overdue > 0) reasons.push({ kind: 'overdue', text: `${p.overdue} ${p.overdue === 1 ? 'day' : 'days'} past its due date` })
    if (p.stage >= 0 && typeof p.daysInStage === 'number' && p.daysInStage >= STUCK_DAYS) reasons.push({ kind: 'stuck', text: `in ${p.stageName} for ${p.stageSinceExact ? '' : 'at least '}${p.daysInStage} days` })
    if (p.staleActions > 0) reasons.push({ kind: 'actions', text: `${p.staleActions} open ${p.staleActions === 1 ? 'action' : 'actions'} older than ${STALE_ACTION_DAYS} days` })
    if (reasons.length) out.push({ code: p.code, name: p.name, stageName: p.stageName, overdue: p.overdue || 0, daysInStage: p.daysInStage ?? null, reasons })
  }
  return out.sort((a, b) => b.overdue - a.overdue || b.reasons.length - a.reasons.length || (b.daysInStage || 0) - (a.daysInStage || 0) || a.code.localeCompare(b.code))
}

/** Every I-code a text names, upper-cased, in order, once each. */
const codesIn = text => [...new Set([...String(text || '').matchAll(new RegExp(CODE_RE.source, 'gi'))].map(m => `I-${m[1]}`))]

/**
 * The last MONTH_DAYS days in numbers: open projects per stage, the stage moves (newest first), how many projects
 * moved and how many are overdue, the Logbook decisions of those days in entries that name an I-code
 * ([{ date, code, text, entry }], newest first), and what needs attention.
 */
export function summary(list, { today = isoToday(), entries = [] } = {}) {
  const from = addDays(today, -(MONTH_DAYS - 1))
  const open = list.filter(p => !p.done)
  const moved = open.flatMap(p => (p.moves || []).filter(m => m.date >= from && m.date <= today).map(m => ({ code: p.code, name: p.name, ...m })))
    .sort((a, b) => b.date.localeCompare(a.date) || a.code.localeCompare(b.code))
  const decisions = entries.filter(e => e?.date && day(e.date) >= from && day(e.date) <= today && e.decisions?.length).flatMap(e => {
    const named = codesIn([e.title, e.project, ...(e.tags || []), e.notes, ...e.decisions].join(' '))
    if (!named.length) return []
    return e.decisions.map(text => ({ date: day(e.date), code: codeOf(text) || named[0], text: String(text), entry: e.title || '' }))
  }).sort((a, b) => b.date.localeCompare(a.date))
  return {
    from, today, open: open.length,
    stages: STAGES.map(({ key, name }, i) => ({ key, name, count: open.filter(p => p.stage === i).length })),
    other: open.filter(p => p.stage < 0).length,
    moved, movedProjects: new Set(moved.map(m => m.code)).size,
    overdue: open.filter(p => p.overdue > 0).length,
    decisions,
    attention: needsAttention(open)
  }
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
  let entries = [], maps = [], feed = []
  try { entries = notes.listEntries() } catch { entries = [] }
  try { maps = notes.listMaps() } catch { maps = [] }
  try { feed = history.list(history.CAP) } catch { feed = [] }
  return { tasks: store.allTasks(), entries, maps, feed }
}
export function list(today = isoToday()) {
  return overview(today).projects
}
/** The list and its summary from one read of the sources: what the page and the portfolio report show. */
export function overview(today = isoToday()) {
  const s = sources()
  const codes = [...cardsByCode(s.tasks).keys()]
  const projects = portfolio(s.tasks, { today, entries: s.entries, maps: s.maps, feed: s.feed, folders: foldersSoft(codes) })
  return { projects, summary: summary(projects, { today, entries: s.entries }) }
}
export function detail(code, today = isoToday()) {
  const c = codeOf(code); if (!c) return null
  const s = sources()
  const p = portfolio(s.tasks, { today, entries: s.entries, maps: s.maps, feed: s.feed, folders: foldersSoft([c]) }).find(x => x.code === c)
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
  app.get('/api/portfolio', wrap((_req, res) => res.json({ stages: STAGES.map(({ key, name, de }) => ({ key, name, de })), ...overview() })))
  app.get('/api/portfolio/:code', wrap((req, res) => { const d = detail(req.params.code); d ? res.json(d) : res.status(404).json({ error: 'not found' }) }))
}
