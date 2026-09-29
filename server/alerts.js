/**
 * Reminders that fit the working day (roadmap 150), on their own timer: once a minute, the first run ten
 * seconds after start. Each rule is a pure function of the data and `now`, so the tests can walk a day
 * through it; the tick feeds them what Bench. already knows and hands what they find to notify(), whose
 * policy (server/notify-policy.js) decides between desktop, Bell and nothing, and drops a key it already
 * sent today. Every job catches its own errors: a failing rule never takes the tick, or the server, down.
 *
 *   meeting    a timed meeting starts within five minutes: subject, time, place; a click joins on Teams
 *   yours      a task's remindAt has come: "Reminder." with the title, once, then the field clears. One that
 *              came while Bench. was closed goes out on the first tick. During a meeting or a focus session
 *              it waits for the end instead of landing only in the Bell. Snoozed Bell rows come back here too.
 *   due        working days: overdue tasks between 07:00 and 12:00, tasks due today still open from 15:00
 *              to 19:00; one summary each a day
 *   actions    working days, 09:00 to 17:00: open Logbook actions due today or overdue, one summary a day
 *   project    working days, 08:00 to 18:00: an innovation project (portfolio.js) due within three working
 *              days, or overdue; once per project per day
 *   arrivals   new open work from Planner or Issues since the last look (Bell only by default)
 *   clock      working days, 09:30 to 12:00: not clocked in yet; any day from 18:30: still clocked in.
 *              timeclock.js sends lunch (12:00), back from lunch and the morning digest; nothing here repeats those.
 *
 * Kept in BENCH_USER_DIR/alerts.json: where "new since the last look" starts. What was sent today lives in
 * notify.js's de-duplication, so a restart does not repeat a summary.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as store from './store.js'
import * as notes from './notes.js'
import * as timeclock from './timeclock.js'
import * as workdays from './workdays.js'
import { portfolio } from './portfolio.js'
import { codeOf } from './codes.js'
import { meetingsCached } from './day.js'
import { notify, holdFor, fireSnoozed } from './notify.js'
import { prepRoute } from './meetprep-live.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = () => path.join(process.env.BENCH_USER_DIR || process.env.BENCH_SECRETS_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data'), 'alerts.json')
export const TICK_MS = 60_000
export const FIRST_MS = 10_000
export const MEETING_LEAD_MIN = 5
export const PROJECT_DAYS = 3

// ── small helpers ─────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const noon = s => new Date(String(s).slice(0, 10) + 'T12:00:00')
const plusDay = (s, n) => { const d = noon(s); d.setDate(d.getDate() + n); return ymd(d) }
/** "Thu 1 Oct" */
export const fmtDay = s => { const d = noon(s); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` }
const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const minOf = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const nowMin = now => now.getHours() * 60 + now.getMinutes()
/** The day part of a date or date-time, local for a date-time. */
const dayOf = v => !v ? null : /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ymd(new Date(v))
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const clip = (s, n = 40) => { const t = String(s || '').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t }
/** "A, B, C and 2 more": one line, whatever the count. */
export const names = (titles, show = 3) => {
  const t = titles.map(x => clip(x))
  if (t.length <= show) return t.length > 1 ? `${t.slice(0, -1).join(', ')} and ${t.at(-1)}` : (t[0] || '')
  return `${t.slice(0, show).join(', ')} and ${t.length - show} more`
}
/** A Planner card that is an innovation project: the project rule speaks for it, not the due-task summaries. */
const isProjectCard = t => t.source === 'planner' && Boolean(codeOf(t.title))

// ── meeting in five minutes ───────────────────────────────────────────
/** Timed meetings that start more than 0 and at most `lead` minutes from now, with the minutes left. */
export function meetingsSoon(meetings, now = new Date(), lead = MEETING_LEAD_MIN) {
  const n = nowMin(now)
  return (meetings || []).filter(m => m && !m.allDay && !m.isCancelled && minOf(m.start) !== null)
    .map(m => ({ ...m, minutes: minOf(m.start) - n }))
    .filter(m => m.minutes > 0 && m.minutes <= lead)
}
/** The join link: the Teams URL, or the event's web link when it is an online meeting. Null for a room. */
export const joinLink = m => m.joinUrl || m.onlineMeeting?.joinUrl || (m.online || m.onlineMeeting ? m.link || m.webLink || null : null)
export function meetingMessage(m) {
  const url = joinLink(m)
  const place = m.location || (url ? 'Teams' : null)
  const time = m.end ? `${m.start} to ${m.end}` : m.start
  return {
    title: `Meeting in ${plural(m.minutes, 'minute')}.`,
    body: [m.subject || 'Meeting', time, place].filter(Boolean).join(', ') + '.',
    route: '#/logbook', ...(url ? { url } : {}),
    category: 'meeting', key: `${m.id || m.subject}@${m.start}`
  }
}

// ── due and overdue tasks ─────────────────────────────────────────────
/** From 15:00 to 19:00 on a working day: open tasks due today. */
export function dueToday(tasks, now = new Date(), workday = true) {
  const n = nowMin(now)
  if (!workday || n < 15 * 60 || n >= 19 * 60) return []
  const today = ymd(now)
  return (tasks || []).filter(t => !t.done && t.dueDate && dayOf(t.dueDate) === today && !isProjectCard(t))
}
/** From 07:00 to 12:00 on a working day: open tasks whose due day has passed. */
export function overdue(tasks, now = new Date(), workday = true) {
  const n = nowMin(now)
  if (!workday || n < 7 * 60 || n >= 12 * 60) return []
  const today = ymd(now)
  return (tasks || []).filter(t => !t.done && t.dueDate && dayOf(t.dueDate) < today && !isProjectCard(t))
}
export const dueTodayMessage = list => ({ title: 'Due today.', body: `${plural(list.length, 'task')} still open: ${names(list.map(t => t.title))}.`, route: '#/board', category: 'due', key: 'today' })
export const overdueMessage = list => ({ title: 'Overdue.', body: `${plural(list.length, 'task')} past the date: ${names(list.map(t => t.title))}.`, route: '#/board', category: 'due', key: 'overdue' })

// ── Logbook actions ───────────────────────────────────────────────────
/**
 * From 09:00 to 17:00 on a working day: open actions due today or earlier. An action already on the board
 * as a task is left to the task (the due summaries count it there).
 */
export function actionsDue(entries, tasks = [], now = new Date(), workday = true) {
  const n = nowMin(now)
  if (!workday || n < 9 * 60 || n >= 17 * 60) return []
  const today = ymd(now)
  const onBoard = new Set((tasks || []).map(t => t.id))
  const out = []
  for (const e of entries || []) {
    for (const a of e.actions || []) {
      if (a.done || !a.due || dayOf(a.due) > today || (a.taskId && onBoard.has(a.taskId))) continue
      out.push({ id: a.id, text: a.text, due: dayOf(a.due), entryId: e.id, entryTitle: e.title })
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due))
}
export const actionsMessage = list => ({ title: 'Logbook actions.', body: `${plural(list.length, 'action')} due or overdue: ${names(list.map(a => a.text))}.`, route: '#/logbook', category: 'logbook', key: 'actions' })

// ── innovation projects ───────────────────────────────────────────────
/** Working days from today to the day, not counting today: 0 on the day, negative calendar days when past. */
export function workingDaysUntil(today, day, isOff = () => false) {
  if (day === today) return 0
  if (day < today) return -Math.round((noon(today) - noon(day)) / 86400000)
  let n = 0
  for (let d = plusDay(today, 1), i = 0; d <= day && i < 400; d = plusDay(d, 1), i++) if (!isOff(d)) n++
  return n
}
/**
 * From 08:00 to 18:00 on a working day: open projects due within `days` working days, or overdue.
 * `projects` is what portfolio() gives: [{ code, name, due, done }].
 */
export function projectsDue(projects, now = new Date(), { workday = true, isOff = () => false, days = PROJECT_DAYS } = {}) {
  const n = nowMin(now)
  if (!workday || n < 8 * 60 || n >= 18 * 60) return []
  const today = ymd(now)
  return (projects || []).filter(p => !p.done && p.due)
    .map(p => ({ ...p, left: workingDaysUntil(today, p.due, isOff) }))
    .filter(p => p.left <= days)
}
export function projectMessage(p) {
  const what = `${p.code}${p.name && p.name !== p.code ? ' ' + clip(p.name, 36) : ''}`
  const when = p.left < 0 ? `${plural(-p.left, 'day')} overdue, due ${fmtDay(p.due)}` : p.left === 0 ? 'due today' : `due ${fmtDay(p.due)}, in ${plural(p.left, 'working day')}`
  return { title: p.left < 0 ? 'Project overdue.' : 'Project due soon.', body: `${what}: ${when}.`, route: `#/projects?i=${encodeURIComponent(p.code)}`, category: 'project', key: p.code }
}

// ── new work ──────────────────────────────────────────────────────────
export const ARRIVAL_SOURCES = ['planner', 'issues']
/** Open tasks from Planner or Issues that came in after `since` (an ISO time). */
export function arrivals(tasks, since) {
  const t0 = since ? new Date(since).getTime() : 0
  return (tasks || []).filter(t => !t.done && ARRIVAL_SOURCES.includes(t.source) && t.createdAt && new Date(t.createdAt).getTime() > t0)
}
const SOURCE_NAME = { planner: 'Planner', issues: 'Issues' }
export function arrivalsMessage(list) {
  const from = [...new Set(list.map(t => SOURCE_NAME[t.source]))].join(' and ')
  const last = list.map(t => t.createdAt).sort().at(-1)
  return { title: 'New work.', body: `${list.length} new from ${from}: ${names(list.map(t => t.title))}.`, route: '#/board', category: 'arrivals', key: last }
}

// ── the clock ─────────────────────────────────────────────────────────
/**
 * 'not-in' on a working day from 09:30 to 12:00 with no clock-in yet today; 'still-in' from 18:30 on any
 * day while clocked in or on a break. Null otherwise. `snap` is timeclock.snapshot().
 */
export function clockCheck(snap, now = new Date(), workday = true) {
  if (!snap) return null
  const n = nowMin(now)
  const clockedIn = (snap.events || []).some(e => e.kind === 'in')
  if (workday && n >= 9 * 60 + 30 && n < 12 * 60 && snap.status === 'off' && !clockedIn) return 'not-in'
  if (n >= 18 * 60 + 30 && (snap.status === 'in' || snap.status === 'lunch')) return 'still-in'
  return null
}
export const clockMessage = (kind, now = new Date()) => kind === 'not-in'
  ? { title: 'Not clocked in.', body: `It is ${hhmm(now)} and the clock has not started today.`, route: '#/', category: 'clock', key: 'not-in' }
  : { title: 'Still clocked in.', body: `It is ${hhmm(now)}. Clock out when you leave.`, route: '#/', category: 'clock', key: 'still-in' }

// ── your own reminders ────────────────────────────────────────────────
/** Tasks whose remindAt has come. Done ones are in the list too, marked, so their reminder is cleared unsaid. */
export function remindersDue(tasks, now = new Date()) {
  return (tasks || []).filter(t => t.remindAt && !Number.isNaN(new Date(t.remindAt).getTime()) && new Date(t.remindAt) <= now)
}
export const reminderMessage = t => ({ title: 'Reminder.', body: clip(t.title, 120), route: '#/board', category: 'reminder', key: `${t.id}|${t.remindAt}` })

/**
 * Fire what is due, once, and clear it. Waits while a meeting runs or a focus session does (the policy would
 * only put it in the Bell then); the quiet hours do not hold it back, so it lands in the Bell for the morning.
 * Returns the ids that were said.
 */
export function fireReminders(now = new Date()) {
  const due = remindersDue(store.allTasks(), now)
  if (!due.length) return []
  const held = holdFor('reminder', now)
  const said = []
  for (const t of due) {
    if (t.done) { store.clearReminder(t.id, t.remindAt); continue }
    if (held === 'meeting' || held === 'focus') continue
    notify(reminderMessage(t), { now })
    store.clearReminder(t.id, t.remindAt)
    said.push(t.id)
  }
  return said
}

// ── memory ────────────────────────────────────────────────────────────
function load() { try { const s = JSON.parse(fs.readFileSync(FILE(), 'utf8')); return s && typeof s === 'object' ? s : {} } catch { return {} } }
function save(s) { try { fs.mkdirSync(path.dirname(FILE()), { recursive: true }); fs.writeFileSync(FILE(), JSON.stringify(s, null, 2)) } catch (err) { console.warn('[alerts] not saved:', err.message) } }

// ── the tick ──────────────────────────────────────────────────────────
const workdayOf = now => { try { return !workdays.isOff(ymd(now)) } catch { return now.getDay() >= 1 && now.getDay() <= 5 } }
const offFn = () => { try { const r = workdays.rules(); return d => workdays.isOff(d, r) } catch { return d => [0, 6].includes(noon(d).getDay()) } }

/**
 * Today's room (roadmap 155): between 08:00 and 11:30 on a working day, the free places on Today and the P2
 * tasks that could take them (not waiting, not parked), and a P1 that found Today full. Pure.
 */
export function todaySuggestions(tasks, now = new Date(), workday = true) {
  const h = now.getHours() + now.getMinutes() / 60
  if (!workday || h < 8 || h >= 11.5) return null
  const open = tasks.filter(t => !t.done)
  const room = Math.max(0, store.TODAY_CAP - open.filter(t => t.lane === 'today').length)
  const p2 = open.filter(t => store.effectivePriority(t) === 2 && !['today', 'waiting', 'parked'].includes(t.lane))
    .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))).slice(0, room)
  // a P1 moved out of Today by hand (p1Placed) was a choice, not a lack of room
  const p1 = open.filter(t => store.effectivePriority(t) === 1 && !t.p1Placed && !['today', 'waiting'].includes(t.lane))
  return { room, p2, p1 }
}
export function suggestionMessages(s, now = new Date()) {
  const out = [], day = ymd(now), list = xs => xs.slice(0, 3).map(t => t.title).join(', ')
  if (s?.p1?.length) out.push({ title: 'P1 with no room.', body: `Today is full. Waiting for a place: ${list(s.p1)}.`, route: '#/board', category: 'suggest', key: `p1-${day}` })
  if (s?.room && s.p2.length) out.push({ title: 'Room on Today.', body: `${s.room} free. P2 this week: ${list(s.p2)}.`, route: '#/board', category: 'suggest', key: `p2-${day}` })
  return out
}

const jobs = [
  ['suggest', (now) => {
    let sent = 0
    for (const m of suggestionMessages(todaySuggestions(store.allTasks(), now, workdayOf(now)), now)) if (notify(m, { now })) sent++
    return sent
  }],
  ['yours', (now) => fireReminders(now)],
  ['snoozed', (now) => fireSnoozed(now).length],
  ['meeting', async (now) => {
    let sent = 0
    for (const m of meetingsSoon(await meetingsCached(now), now)) if (notify({ ...meetingMessage(m), ...prepRoute(m, now) }, { now })) sent++   // the prep page when there is something to bring (roadmap 163)
    return sent
  }],
  ['due', (now) => {
    const tasks = store.allTasks(), workday = workdayOf(now)
    let sent = 0
    const late = overdue(tasks, now, workday); if (late.length && notify(overdueMessage(late), { now })) sent++
    const today = dueToday(tasks, now, workday); if (today.length && notify(dueTodayMessage(today), { now })) sent++
    return sent
  }],
  ['actions', (now) => {
    const list = actionsDue(notes.listEntries(), store.allTasks(), now, workdayOf(now))
    return list.length && notify(actionsMessage(list), { now }) ? 1 : 0
  }],
  ['project', (now) => {
    const tasks = store.allTasks()
    let entries = []
    try { entries = notes.listEntries() } catch { entries = [] }
    const list = projectsDue(portfolio(tasks, { today: ymd(now), entries }), now, { workday: workdayOf(now), isOff: offFn() })
    let sent = 0
    for (const p of list) if (notify(projectMessage(p), { now })) sent++
    return sent
  }],
  ['arrivals', (now) => {
    const s = load(), tasks = store.allTasks()
    const newest = list => list.filter(t => ARRIVAL_SOURCES.includes(t.source) && t.createdAt).map(t => t.createdAt).sort().at(-1) || null
    // the first look starts the count, it does not list the whole board
    if (!s.arrivalsSince) { save({ ...s, arrivalsSince: newest(tasks) || now.toISOString() }); return 0 }
    const list = arrivals(tasks, s.arrivalsSince)
    if (!list.length) return 0
    save({ ...s, arrivalsSince: newest(list) })
    return notify(arrivalsMessage(list), { now }) ? 1 : 0
  }],
  ['clock', (now) => {
    const kind = clockCheck(timeclock.snapshot(), now, workdayOf(now))
    return kind && notify(clockMessage(kind, now), { now }) ? 1 : 0
  }]
]
export async function tick(now = new Date()) {
  const out = {}
  for (const [name, job] of jobs) {
    try { out[name] = await job(now) } catch (err) { out[name] = null; console.warn(`[alerts:${name}]`, err.message) }
  }
  return out
}

let timers = []
export function start() {
  if (timers.length) return
  const run = () => tick().catch(err => console.warn('[alerts]', err.message))
  timers = [setTimeout(run, FIRST_MS), setInterval(run, TICK_MS)]
  timers.forEach(t => t.unref?.())
}
export function stop() { timers.forEach(t => { clearTimeout(t); clearInterval(t) }); timers = [] }
