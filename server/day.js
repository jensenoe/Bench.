/**
 * The day's two bookends and the week's review (roadmap 68, 69, 72, 73, 83).
 *
 *   GET  /api/day/brief         what the morning looks like: leftovers, arrivals, due, orders, meetings, the sheet
 *   POST /api/day/brief/seen    the brief was shown; do not show it again today
 *   POST /api/day/brief/apply   move some leftovers back to Active, record what stays on Today
 *   GET  /api/day/close         what the evening looks like: open Today tasks, hours, ticked
 *   POST /api/day/close         move tasks, write or update today's day note in the Logbook
 *   GET  /api/day/capacity      free hours today against what Today holds
 *   GET  /api/review?start=     one week, Monday to Sunday, with a plain-text summary
 *
 * `start()` runs the meeting-ended check once a minute: a meeting that ended in the last three minutes
 * without a Logbook entry of that title gets one notification.
 *
 * What was on Today at the last brief, whether today's brief was seen and which meetings were notified
 * live in day.json in the per-user folder (it is one person's day), next to timeclock.json.
 * Everything that decides something is a pure function exported for the tests.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as store from './store.js'
import * as notes from './notes.js'
import * as timeclock from './timeclock.js'
import * as calendar from './calendar.js'
import * as settings from './settings.js'
import { bridge } from './bridge.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATE_FILE = path.join(
  process.env.BENCH_USER_DIR || process.env.BENCH_SECRETS_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data'),
  'day.json'
)

const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))

// ── time helpers ──────────────────────────────────────────────────────
const DAY = 86400000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Local calendar day as yyyy-mm-dd. Never the UTC slice: an evening in Zurich is still today. */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const midnightOf = (d = new Date()) => { const m = new Date(d); m.setHours(0, 0, 0, 0); return m }
const noon = iso => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)
/** Whole calendar days from `from` to the date, negative when past. */
export const daysUntil = (iso, from = new Date()) => iso ? Math.round((midnightOf(noon(iso)) - midnightOf(from)) / DAY) : null
/** The day of a timestamp or a date string, as yyyy-mm-dd, for comparing with a date-only field. */
const dayOf = iso => iso ? (iso.length === 10 ? iso : dayKey(new Date(iso))) : null
/** Milliseconds as H:MM. */
export const hm = ms => { const m = Math.round((ms || 0) / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` }
const round1 = n => Math.round(n * 10) / 10
/** "Tue 22 Sep", the same shape the UI writes. */
export const shortDate = (iso, { weekday = true } = {}) => { const d = noon(iso); return `${weekday ? DAYS[d.getDay()] + ' ' : ''}${d.getDate()} ${MONTHS[d.getMonth()]}` }
const minutes = hhmm => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const TOOL = { planner: 'Phase Gate', issues: 'Issues', qms: 'QMS', bom: 'the BOM' }

// ── state ─────────────────────────────────────────────────────────────
const fresh = () => ({ date: null, seen: false, leftovers: [], since: null, todayIds: [], briefAt: null, notified: { date: null, ids: [] } })
let state = load()
function load() {
  try { const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); return { ...fresh(), ...s } } catch { return fresh() }
}
function save() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  const tmp = STATE_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
  fs.renameSync(tmp, STATE_FILE)
}
/** For the tests: forget the file and start the day again. */
export function _reset() { state = fresh(); save() }

// ── pure parts ────────────────────────────────────────────────────────
/**
 * Leftovers: open tasks on Today that were already there before today. Two signals, either counts:
 * the id was on Today at the last brief, or the task has not been touched since before midnight
 * (the only signal on the very first brief).
 */
export function pickLeftovers(tasks, { previousTodayIds = [], midnight = midnightOf() } = {}) {
  const was = new Set(previousTodayIds)
  return tasks.filter(t => t.lane === 'today' && !t.done && (was.has(t.id) || (t.updatedAt && new Date(t.updatedAt) < midnight)))
}
/** Came in overnight: open tasks a tool created since the last brief. Typed-in tasks are yours; you know about them. */
export function pickArrived(tasks, sinceIso) {
  const since = sinceIso ? new Date(sinceIso).getTime() : 0
  return tasks.filter(t => !t.done && t.source && t.source !== 'local' && t.createdAt && new Date(t.createdAt).getTime() > since)
}
/** Open tasks due on or before the day. */
export const pickDue = (tasks, today = dayKey()) => tasks.filter(t => !t.done && t.dueDate && dayOf(t.dueDate) <= today)
/** Open tasks with an order-by date inside three days (or past) that have not been ordered. */
export const pickOrders = (tasks, now = new Date()) => tasks.filter(t => !t.done && t.orderBy && !t.orderedOn && daysUntil(t.orderBy, now) <= 3)

/**
 * Free hours today against what Today holds. Meetings are the non-all-day ones on today's calendar;
 * clocked is what the time clock has so far. Tasks without an effort size are counted, not summed.
 */
export function capacity({ workdayHours = 8.4, meetings = [], clockedMs = 0, tasks = [], now = null } = {}) {
  // Only what is still ahead counts as a meeting; a meeting already sat through is inside the clocked hours.
  const nowMin = now ? now.getHours() * 60 + now.getMinutes() : null
  const meetingMinutes = meetings.filter(m => !m.allDay).reduce((s, m) => {
    const a = minutes(m.start), b = minutes(m.end)
    if (a === null || b === null) return s
    const from = nowMin === null ? a : Math.max(a, nowMin)
    return s + Math.max(0, b - from)
  }, 0)
  const meetingHours = round1(meetingMinutes / 60)
  const clockedHours = round1(clockedMs / 3600000)
  const freeHours = Math.max(0, round1(workdayHours - meetingHours - clockedHours))
  const open = tasks.filter(t => t.lane === 'today' && !t.done)
  const sized = t => t.effortHours !== null && t.effortHours !== undefined && t.effortHours !== ''
  const todayHours = round1(open.filter(sized).reduce((s, t) => s + (Number(t.effortHours) || 0), 0))
  return { workdayHours, meetingHours, clockedHours, freeHours, todayHours, unsized: open.filter(t => !sized(t)).length, over: todayHours > freeHours }
}

/** Non-all-day meetings whose end passed within the window (three minutes by default). */
export function endedRecently(events, now = new Date(), windowMs = 3 * 60_000) {
  const t = now.getTime(), mid = midnightOf(now).getTime()
  return (events || []).filter(m => {
    if (m.allDay) return false
    const end = minutes(m.end); if (end === null) return false
    const endAt = mid + end * 60_000
    return endAt <= t && t - endAt <= windowMs
  })
}

/** The day note's text: hours, what was ticked, meetings held, what rolls over. Short lines. */
export function dayNoteText({ workedMs = 0, ticked = [], meetings = [], keep = [] } = {}) {
  const lines = []
  lines.push(workedMs ? `${hm(workedMs)} on the clock.` : 'Nothing on the clock.')
  lines.push(ticked.length ? `Ticked ${plural(ticked.length, 'task')}: ${ticked.map(t => t.title).join(', ')}.` : 'Nothing ticked.')
  const held = meetings.filter(m => !m.allDay)
  if (held.length) lines.push(`Meetings: ${held.map(m => `${m.subject}${m.start ? ' at ' + m.start : ''}`).join(', ')}.`)
  lines.push(keep.length ? `Rolls to tomorrow: ${keep.map(t => t.title).join(', ')}.` : 'Nothing rolls to tomorrow.')
  return lines.join('\n')
}

/** Monday and Sunday of the week that holds the date (today when none), as yyyy-mm-dd. */
export function weekOf(dateStr) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr || '') ? noon(dateStr) : new Date()
  const mon = new Date(d); mon.setHours(12, 0, 0, 0); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return { start: dayKey(mon), end: dayKey(sun) }
}
/** ISO 8601 week number of a date. */
export function isoWeek(dateStr) {
  const d = noon(dateStr)
  const u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = u.getUTCDay() || 7
  u.setUTCDate(u.getUTCDate() + 4 - day)
  const jan1 = new Date(Date.UTC(u.getUTCFullYear(), 0, 1))
  return Math.ceil(((u - jan1) / DAY + 1) / 7)
}

/** The week's figures from the raw lists. `clocked` is what timeclock.days gives, already cut to the week. */
export function buildReview({ start, end, tasks = [], entries = [], clocked = [], firstName = '' }) {
  const inWeek = iso => { const k = dayOf(iso); return k !== null && k >= start && k <= end }
  const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '')
  const done = tasks.filter(t => t.done && t.completedBy === 'local' && inWeek(t.completedAt))
    .sort((a, b) => (a.completedAt || '').localeCompare(b.completedAt || ''))
    .map(t => ({ id: t.id, title: t.title, project: t.project || null, completedAt: t.completedAt }))
  const slipped = tasks.filter(t => !t.done && t.dueDate && inWeek(t.dueDate)).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || byTitle(a, b))
    .map(t => ({ id: t.id, title: t.title, dueDate: dayOf(t.dueDate) }))
  const hours = new Map()
  for (const t of tasks.filter(t => t.done && t.completedBy === 'local' && inWeek(t.completedAt))) {
    const h = Number(t.effortHours) || 0; if (!h) continue
    const p = t.project || 'Unassigned'; hours.set(p, round1((hours.get(p) || 0) + h))
  }
  const hoursByProject = [...hours.entries()].map(([project, hours]) => ({ project, hours })).sort((a, b) => b.hours - a.hours || a.project.localeCompare(b.project))
  const innovation = tasks.filter(t => t.lane === 'innovation' && inWeek(t.lastTouched || t.updatedAt)).sort(byTitle)
    .map(t => ({ id: t.id, title: t.title, done: !!t.done, lastTouched: t.lastTouched || t.updatedAt }))
  const orders = tasks.filter(t => t.orderedOn && inWeek(t.orderedOn)).sort((a, b) => a.orderedOn.localeCompare(b.orderedOn) || byTitle(a, b))
    .map(t => ({ id: t.id, title: t.title, orderedOn: dayOf(t.orderedOn), supplier: t.supplier || null, poNumber: t.poNumber || null }))
  const logbook = entries.filter(e => e.date && e.date >= start && e.date <= end).sort((a, b) => a.date.localeCompare(b.date) || byTitle(a, b))
    .map(e => ({ id: e.id, title: e.title, date: e.date }))
  const week = { start, end, week: isoWeek(start), firstName, done, slipped, hoursByProject, clocked: clocked.map(d => ({ date: d.date, worked: d.worked || 0 })), innovation, orders, logbook }
  return { ...week, text: reviewText(week) }
}

/** The review as short sentences, ready for a mail. Empty sections say so in one line. */
export function reviewText(r) {
  const lines = [`Week ${r.week}, ${shortDate(r.start, { weekday: false })} to ${shortDate(r.end, { weekday: false })}.`, '']
  lines.push(r.done.length ? `Done, ${plural(r.done.length, 'task')}:` : 'Nothing ticked this week.')
  for (const t of r.done) lines.push(`  ${t.title}${t.project ? ` (${t.project})` : ''}`)
  lines.push('')
  lines.push(r.slipped.length ? `Slipped, ${r.slipped.length}:` : 'Nothing slipped.')
  for (const t of r.slipped) lines.push(`  ${t.title}, due ${shortDate(t.dueDate)}`)
  lines.push('')
  const worked = r.clocked.reduce((s, d) => s + (d.worked || 0), 0)
  const daysOn = r.clocked.filter(d => d.worked > 0).length
  lines.push(worked ? `${hm(worked)} on the clock over ${plural(daysOn, 'day')}: ${r.clocked.filter(d => d.worked > 0).map(d => `${shortDate(d.date).slice(0, 3)} ${hm(d.worked)}`).join(', ')}.` : 'Nothing on the clock.')
  lines.push(r.hoursByProject.length ? `Hours by project: ${r.hoursByProject.map(p => `${p.project} ${p.hours}`).join(', ')}.` : 'No sized tasks were ticked.')
  lines.push('')
  lines.push(r.innovation.length ? `Innovation, ${plural(r.innovation.length, 'item')} touched: ${r.innovation.map(t => t.title).join(', ')}.` : 'Innovation did not move.')
  lines.push(r.orders.length ? `Ordered, ${r.orders.length}: ${r.orders.map(t => `${t.title}${t.supplier ? ' from ' + t.supplier : ''}`).join(', ')}.` : 'Nothing ordered.')
  lines.push(r.logbook.length ? `Logbook, ${plural(r.logbook.length, 'entry', 'entries')}: ${r.logbook.map(e => `${e.title} (${shortDate(e.date)})`).join(', ')}.` : 'Nothing in the logbook.')
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

// ── the brief ─────────────────────────────────────────────────────────
const openTodayIds = () => store.allTasks().filter(t => t.lane === 'today' && !t.done).map(t => t.id)

/** First look of the day: freeze what counts as a leftover and where "overnight" starts, so the brief stays put all day. */
function ensureDay() {
  const today = dayKey()
  if (state.date === today) return
  const yesterdayMidnight = new Date(midnightOf().getTime() - DAY).toISOString()
  const leftovers = pickLeftovers(store.allTasks(), { previousTodayIds: state.todayIds })
  state = { ...state, date: today, seen: false, leftovers: leftovers.map(t => t.id), since: state.briefAt || yesterdayMidnight }
  save()
}

async function meetingsSoft() {
  try { const r = await calendar.todaysMeetings(); return r?.ok ? (r.events || []) : [] } catch { return [] }
}

export async function brief() {
  ensureDay()
  const tasks = store.allTasks()
  const brief = t => ({ id: t.id, title: t.title, project: t.project || null, source: t.source || 'local', tool: TOOL[t.source] || null, dueDate: t.dueDate || null, orderBy: t.orderBy || null, effortHours: t.effortHours ?? null })
  const snap = timeclock.snapshot()
  return {
    date: state.date,
    seen: state.seen,
    leftovers: tasks.filter(t => t.lane === 'today' && !t.done && state.leftovers.includes(t.id)).map(brief),
    arrived: pickArrived(tasks, state.since).map(brief),
    due: pickDue(tasks, state.date).map(brief),
    orders: pickOrders(tasks).map(t => ({ ...brief(t), days: daysUntil(t.orderBy) })),
    meetings: (await meetingsSoft()).map(m => ({ id: m.id, subject: m.subject, allDay: m.allDay, start: m.start, end: m.end, location: m.location || null })),
    sheet: { pending: snap.pending || 0, unclosed: snap.unclosed || null }
  }
}

/** The brief was shown. What is on Today now is the record tomorrow's leftovers are read against. */
export function markSeen() {
  ensureDay()
  state.seen = true
  state.briefAt = new Date().toISOString()
  state.todayIds = openTodayIds()
  save()
  return { seen: true, date: state.date }
}

/** Leftovers named in `toActive` go back to Active; the other leftovers stay. Anything else on Today is not the brief's to move. */
export function applyBrief({ toActive = [] } = {}) {
  ensureDay()
  const ids = new Set((Array.isArray(toActive) ? toActive : []).filter(id => state.leftovers.includes(id)))
  let moved = 0
  for (const t of store.allTasks()) {
    if (ids.has(t.id) && t.lane === 'today' && !t.done) { store.updateTask(t.id, { lane: 'active' }); moved++ }
  }
  markSeen()
  return { moved }
}

// ── the close ─────────────────────────────────────────────────────────
const tickedToday = (tasks, today = dayKey()) => tasks.filter(t => t.done && t.completedBy === 'local' && t.completedAt && dayOf(t.completedAt) === today)

export function closePreview() {
  const today = dayKey(), tasks = store.allTasks()
  return {
    date: today,
    today: tasks.filter(t => t.lane === 'today' && !t.done).map(t => ({ id: t.id, title: t.title, project: t.project || null })),
    worked: timeclock.days(1)[0]?.worked || 0,
    ticked: tickedToday(tasks, today).length
  }
}

export async function closeDay({ toActive = [], keep = [], note = true } = {}) {
  const today = dayKey()
  const ids = new Set(Array.isArray(toActive) ? toActive : [])
  let moved = 0
  for (const t of store.allTasks()) {
    if (ids.has(t.id) && t.lane === 'today' && !t.done) { store.updateTask(t.id, { lane: 'active' }); moved++ }
  }
  let entry = null
  if (note) {
    const tasks = store.allTasks()
    const keepIds = new Set(Array.isArray(keep) ? keep : [])
    const rolling = tasks.filter(t => keepIds.has(t.id) && !t.done)
    const text = dayNoteText({ workedMs: timeclock.days(1)[0]?.worked || 0, ticked: tickedToday(tasks, today), meetings: await meetingsSoft(), keep: rolling })
    const existing = notes.listEntries().find(e => e.date === today && ((e.tags || []).includes('day') || e.title === 'Day note.'))
    entry = existing ? notes.updateEntry(existing.id, { notes: text, tags: [...new Set([...(existing.tags || []), 'day'])] })
      : notes.createEntry({ title: 'Day note.', tags: ['day'], project: null, date: today, notes: text })
  }
  return { moved, entry }
}

// ── capacity ──────────────────────────────────────────────────────────
export async function capacityNow() {
  return capacity({
    workdayHours: Number(settings.get().workdayHours) || 8.4,
    meetings: await meetingsSoft(),
    clockedMs: timeclock.days(1)[0]?.worked || 0,
    tasks: store.allTasks(),
    now: new Date()
  })
}

// ── review ────────────────────────────────────────────────────────────
export function review(startParam) {
  const { start, end } = weekOf(startParam)
  const today = dayKey()
  // timeclock.days(n) counts back from today, so ask for enough days to reach the week's Monday (90 is all it keeps).
  const back = Math.round((midnightOf() - midnightOf(noon(start))) / DAY) + 1
  const last = end < today ? end : today
  const clocked = back > 0 ? timeclock.days(Math.min(90, back)).filter(d => d.date >= start && d.date <= last) : []
  return buildReview({ start, end, tasks: store.allTasks(), entries: notes.listEntries(), clocked, firstName: settings.displayFirstName() })
}

// ── meeting ended, write it down ──────────────────────────────────────
let calCache = { date: null, at: 0, events: [] }
async function meetingsCached(now = new Date()) {
  const today = dayKey(now)
  if (calCache.date !== today || now.getTime() - calCache.at > 10 * 60_000) calCache = { date: today, at: now.getTime(), events: await meetingsSoft() }
  return calCache.events
}
const norm = s => String(s || '').trim().toLowerCase()

export async function checkMeetings(now = new Date()) {
  const today = dayKey(now)
  if (state.notified?.date !== today) { state.notified = { date: today, ids: [] }; save() }
  const ended = endedRecently(await meetingsCached(now), now)
  if (!ended.length) return []
  const written = new Set(notes.listEntries().filter(e => e.date === today).map(e => norm(e.title)))
  const fired = []
  for (const m of ended) {
    if (state.notified.ids.includes(m.id) || written.has(norm(m.subject))) continue
    state.notified.ids.push(m.id); save()
    bridge.notify?.({ title: 'Write it down?', body: `${m.subject} just ended.`, route: `#/logbook?new=${encodeURIComponent(m.subject)}` })
    fired.push(m.id)
  }
  return fired
}

let timer = null
export function start(everyMs = 60_000) {
  if (timer) return
  const tick = () => checkMeetings().catch(err => console.warn('[day]', err.message))
  tick()
  timer = setInterval(tick, everyMs)
}

// ── routes ────────────────────────────────────────────────────────────
export function registerRoutes(app) {
  app.get('/api/day/brief', wrap(async (_req, res) => res.json(await brief())))
  app.post('/api/day/brief/seen', wrap((_req, res) => res.json(markSeen())))
  app.post('/api/day/brief/apply', wrap((req, res) => res.json(applyBrief(req.body || {}))))
  app.get('/api/day/close', wrap((_req, res) => res.json(closePreview())))
  app.post('/api/day/close', wrap(async (req, res) => res.json(await closeDay(req.body || {}))))
  app.get('/api/day/capacity', wrap(async (_req, res) => res.json(await capacityNow())))
  app.get('/api/review', wrap((req, res) => res.json(review(String(req.query.start || '')))))
}
