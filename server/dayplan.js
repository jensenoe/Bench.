/**
 * Plan my day (roadmap 161). One proposal for Today: what stays, what comes in, what goes back to Active,
 * each with one plain reason, inside the five places and the free hours of the day.
 *
 *   proposeDay(tasks, opts)     pure: the board in, { keep, add, out, hours, why } out
 *   summary(proposal)           the one line for the morning brief, or null when nothing would change
 *   GET  /api/dayplan           the proposal for now, with the titles the panel shows
 *   POST /api/dayplan/apply     { add, out }: add to Today, out back to Active. Lanes only, through store.updateTask
 *   POST /api/dayplan/undo      { before }: the lanes as apply found them
 *
 * The order of claims: overdue, due today, P1, due within two working days, a waiting task whose follow-up is
 * due, P2 by due date, then one Innovation item cold for fourteen days or more, so Innovation does not starve.
 * What is already on Today and claims nothing else stays when there is room. Parked never comes in; Waiting
 * only for a chase. Unsized tasks count as one hour. Nothing here moves a card on its own: only apply does,
 * and only when you ask for it.
 */
import * as workdays from './workdays.js'
import * as store from './store.js'
import * as settings from './settings.js'
import { meetingsCached, dayKey } from './day.js'

const DAY = 86400000
export const DEFAULT_CAP = 5
/** A task without a size counts as this many hours. */
export const UNSIZED_HOURS = 1
/** Waiting this many working days (or a follow-up of your own that has come) means time to chase. */
export const CHASE_WORKDAYS = 4
/** Innovation untouched this many days is cold. */
export const COLD_DAYS = 14
/** Due within this many working days after today counts as soon. */
export const SOON_WORKDAYS = 2

const TIER = { overdue: 0, today: 1, p1: 2, soon: 3, chase: 4, p2: 5, cold: 6, kept: 7 }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const noon = s => new Date(String(s).slice(0, 10) + 'T12:00:00')
const plus = (s, n) => { const d = noon(s); d.setDate(d.getDate() + n); return key(d) }
/** The local day of a date or a timestamp, as yyyy-mm-dd. */
const dayOf = v => { if (!v) return null; const s = String(v); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const d = new Date(s); return Number.isNaN(d.getTime()) ? null : key(d) }
const between = (a, b) => Math.round((noon(b) - noon(a)) / DAY)
const shortDate = s => { const d = noon(s); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` }
const round1 = n => Math.round(n * 10) / 10
const hhmm = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const prio = t => t.priority ?? (Number(t.meta?.prio) >= 1 && Number(t.meta?.prio) <= 3 ? Number(t.meta.prio) : null)
const sized = t => t.effortHours !== null && t.effortHours !== undefined && t.effortHours !== '' && !Number.isNaN(Number(t.effortHours))
/** A task's hours for the plan: its size, or one hour when it has none. */
export const effortOf = t => sized(t) ? Math.max(0, Number(t.effortHours)) : UNSIZED_HOURS

/** The n-th working day after `today`. */
export function nthWorkday(today, n, isOff = workdays.isOff) {
  let d = today
  for (let k = 0, guard = 0; k < n && guard < 60; guard++) { d = plus(d, 1); if (!isOff(d)) k++ }
  return d
}
/** Working days after `from` up to and including `to`. */
export function workdaysBetween(from, to, isOff = workdays.isOff) {
  let n = 0
  for (let d = plus(from, 1), guard = 0; d <= to && guard < 400; d = plus(d, 1), guard++) if (!isOff(d)) n++
  return n
}
/** Hours of timed meetings on the day; all-day events are not meetings. */
export function meetingHours(meetings = []) {
  const min = (meetings || []).filter(m => m && !m.allDay).reduce((s, m) => {
    const a = hhmm(m.start), b = hhmm(m.end)
    return a === null || b === null ? s : s + Math.max(0, b - a)
  }, 0)
  return round1(min / 60)
}

/**
 * Why a waiting task should come in today, or null when it should stay with the other person: a reminder of
 * your own that has come, or four working days of waiting.
 */
export function followUp(t, { today, isOff = workdays.isOff } = {}) {
  if (t.lane !== 'waiting' || t.done) return null
  const who = t.waitingOn ? String(t.waitingOn).trim() : ''
  const remind = dayOf(t.remindAt)
  if (remind && remind <= today) return who ? `Your follow-up with ${who} is due.` : 'Your follow-up is due.'
  const since = dayOf(t.waitingSince)
  if (!since || since >= today) return null
  if (workdaysBetween(since, today, isOff) < CHASE_WORKDAYS) return null
  const days = between(since, today)
  return `Waiting ${days} days${who ? ` on ${who}` : ''}; time to chase.`
}

/** The claim a task has on today: { tier, sort, why }, or null when it has none. */
function claimOf(t, ctx) {
  if (t.done || t.lane === 'parked') return null
  if (t.lane === 'waiting') {
    const why = followUp(t, ctx)
    return why ? { tier: TIER.chase, sort: dayOf(t.waitingSince) || ctx.today, why } : null
  }
  const due = dayOf(t.dueDate), p = prio(t)
  if (due && due < ctx.today) return { tier: TIER.overdue, sort: due, why: `Was due ${shortDate(due)}.` }
  if (due === ctx.today) return { tier: TIER.today, sort: String(p ?? 9), why: 'Due today.' }
  if (p === 1) return { tier: TIER.p1, sort: due || '9999', why: 'P1.' }
  if (due && due <= ctx.soon) return { tier: TIER.soon, sort: due, why: due === ctx.tomorrow ? 'Due tomorrow.' : `Due ${shortDate(due)}.` }
  if (p === 2) return { tier: TIER.p2, sort: due || '9999', why: due ? `P2, due ${shortDate(due)}.` : 'P2.' }
  if (t.lane === 'innovation') {
    const touched = dayOf(t.lastTouched || t.updatedAt || t.createdAt)
    const cold = touched ? between(touched, ctx.today) : 0
    if (cold >= COLD_DAYS) return { tier: TIER.cold, sort: touched, why: `Innovation, untouched for ${cold} days.`, innovation: true }
  }
  if (t.lane === 'today') return { tier: TIER.kept, sort: '', why: 'On Today already, and there is room.' }
  return null
}

/**
 * The proposal. `tasks` is the whole board; `today` is yyyy-mm-dd (local); `meetings` are today's calendar
 * events ({ start, end, allDay }, start and end as HH:MM); `workdayHours` the day's length; `cap` Today's places.
 *
 * Returns { keep, add, out, hours: { free, planned, workday, meetings, unsized }, why: { id: reason }, count }.
 * keep and add come in the order of their claims; out in the order the cards sit on Today.
 */
export function proposeDay(tasks = [], { today = key(new Date()), meetings = [], workdayHours = 8.4, cap = DEFAULT_CAP, isOff = workdays.isOff } = {}) {
  const ctx = { today, tomorrow: plus(today, 1), soon: nthWorkday(today, SOON_WORKDAYS, isOff), isOff }
  const open = (tasks || []).filter(t => t && t.id && !t.done)
  const openIds = new Set(open.map(t => t.id))
  const onToday = open.filter(t => t.lane === 'today')
  // a card that waits for another open card cannot start, so it does not come in (roadmap 132)
  const blocked = t => t.lane !== 'today' && Array.isArray(t.after) && t.after.some(id => openIds.has(id))

  const claims = []
  for (const t of open) {
    if (blocked(t)) continue
    const c = claimOf(t, ctx)
    if (c) claims.push({ t, ...c })
  }
  // one cold Innovation item at most: the coldest
  const cold = claims.filter(c => c.tier === TIER.cold).sort((a, b) => a.sort.localeCompare(b.sort))
  const ranked = claims.filter(c => c.tier !== TIER.cold || c === cold[0])
  ranked.sort((a, b) => a.tier - b.tier || (a.t.lane === 'today' ? 0 : 1) - (b.t.lane === 'today' ? 0 : 1)
    || String(a.sort).localeCompare(String(b.sort)) || (a.t.order ?? 0) - (b.t.order ?? 0))

  const workday = Math.max(0, Number(workdayHours) || 0)
  const inMeetings = meetingHours(meetings)
  const free = Math.max(0, round1(workday - inMeetings))
  const why = {}, picked = new Set(), missed = {}
  let planned = 0, unsized = 0
  for (const c of ranked) {
    const e = effortOf(c.t)
    if (picked.size >= cap) { missed[c.t.id] = 'cap'; continue }
    if (planned + e > free + 1e-9) { missed[c.t.id] = 'hours'; continue }
    picked.add(c.t.id); planned += e; if (!sized(c.t)) unsized++
    why[c.t.id] = c.why
  }
  const keep = ranked.filter(c => picked.has(c.t.id) && c.t.lane === 'today').map(c => c.t.id)
  const add = ranked.filter(c => picked.has(c.t.id) && c.t.lane !== 'today').map(c => c.t.id)
  const out = onToday.filter(t => !picked.has(t.id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(t => t.id)
  for (const id of out) why[id] = missed[id] === 'hours' ? 'It does not fit in the hours left.' : 'Today is full with more pressing work.'
  return { keep, add, out, hours: { free, planned: round1(planned), workday: round1(workday), meetings: inMeetings, unsized }, why, count: keep.length + add.length }
}

/** The morning brief's line, or null when the plan would not change anything. */
export function summary(p) {
  const a = p?.add?.length || 0, o = p?.out?.length || 0
  if (!a && !o) return null
  const parts = [a ? `${a} to add` : null, o ? `${o} to move back` : null].filter(Boolean)
  return `Plan my day is ready: ${parts.join(', ')}.`
}

// ── now ───────────────────────────────────────────────────────────────
/** The proposal for this moment on this board, with what the panel shows of each card. */
export async function proposalNow(now = new Date()) {
  const tasks = store.allTasks()
  let meetings = []
  try { meetings = await meetingsCached(now) } catch { meetings = [] }
  const p = proposeDay(tasks, { today: dayKey(now), meetings, workdayHours: Number(settings.get().workdayHours) || 8.4, cap: store.TODAY_CAP })
  const byId = new Map(tasks.map(t => [t.id, t]))
  const items = {}
  for (const id of [...p.keep, ...p.add, ...p.out]) {
    const t = byId.get(id); if (!t) continue
    items[id] = { id, title: t.title, project: t.project || null, lane: t.lane, effortHours: sized(t) ? Number(t.effortHours) : null, hours: effortOf(t), priority: prio(t) }
  }
  return { date: dayKey(now), cap: store.TODAY_CAP, ...p, items }
}

const uniq = v => [...new Set((Array.isArray(v) ? v : []).filter(x => typeof x === 'string' && x))]

/**
 * `out` back to Active, then `add` to Today. Only the lane changes, through store.updateTask, so every move is
 * in the history like a drag. Refused whole (409) when the result would not fit the cap, before anything moves.
 * Returns { added, moved, before }: before is what undo needs to put the lanes back.
 */
export function applyPlan({ add = [], out = [] } = {}) {
  const tasks = store.allTasks()
  const byId = new Map(tasks.map(t => [t.id, t]))
  const outIds = uniq(out).filter(id => { const t = byId.get(id); return t && !t.done && t.lane === 'today' })
  const addIds = uniq(add).filter(id => { const t = byId.get(id); return t && !t.done && t.lane !== 'today' && t.lane !== 'parked' && !outIds.includes(id) })
  const after = tasks.filter(t => t.lane === 'today' && !t.done).length - outIds.length + addIds.length
  if (after > store.TODAY_CAP) throw new store.CapError(`Today is full. ${after} would not fit in ${store.TODAY_CAP} places.`)
  const before = []
  for (const id of outIds) { before.push({ id, lane: 'today' }); store.updateTask(id, { lane: 'active' }) }
  for (const id of addIds) {
    const t = byId.get(id)
    before.push({ id, lane: t.lane, waitingSince: t.waitingSince || null })
    store.updateTask(id, { lane: 'today' })
  }
  return { added: addIds.length, moved: outIds.length, before }
}

/**
 * Undo of apply: what came in goes back where it was (a waiting card with its waiting date), then what went
 * back returns to Today. A card that moved again since is left where it is now. Returns { restored, skipped }.
 */
export function undoPlan({ before = [] } = {}) {
  const list = (Array.isArray(before) ? before : []).filter(b => b && typeof b.id === 'string' && store.LANES.includes(b.lane))
  let restored = 0, skipped = 0
  const find = id => store.allTasks().find(t => t.id === id)
  for (const b of list.filter(x => x.lane !== 'today')) {
    const t = find(b.id)
    if (!t || t.done || t.lane !== 'today') { skipped++; continue }
    const since = b.lane === 'waiting' && typeof b.waitingSince === 'string' && !Number.isNaN(new Date(b.waitingSince).getTime()) ? b.waitingSince : null
    store.updateTask(b.id, since ? { lane: b.lane, waitingSince: since } : { lane: b.lane })
    restored++
  }
  for (const b of list.filter(x => x.lane === 'today')) {
    const t = find(b.id)
    if (!t || t.done || t.lane !== 'active') { skipped++; continue }
    try { store.updateTask(b.id, { lane: 'today' }); restored++ } catch (err) { if (err.status === 409) skipped++; else throw err }
  }
  return { restored, skipped }
}

// ── routes ────────────────────────────────────────────────────────────
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))
export function registerRoutes(app) {
  app.get('/api/dayplan', wrap(async (_req, res) => res.json(await proposalNow())))
  app.post('/api/dayplan/apply', wrap((req, res) => res.json(applyPlan(req.body || {}))))
  app.post('/api/dayplan/undo', wrap((req, res) => res.json(undoPlan(req.body || {}))))
}
