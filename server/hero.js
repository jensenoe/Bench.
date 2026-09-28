/**
 * The line under the greeting on Home (roadmap 119): a short briefing that changes with the moment,
 * never a deadline. Deadlines live in the morning brief and the amber lines on the Board. Here it is
 * what happened, what is next in the calendar, what arrived, how the day is going, and when nothing
 * of that applies, the last decision written down.
 *
 *   composeHero(facts, now)   pure: facts in, { variant, lines } out
 *   hero()                    gathers the facts from the clock, the board, the calendar, the Logbook
 *   GET /api/day/hero         { variant, lines: [{ kind, text }], weather }
 */
import * as store from './store.js'
import * as notes from './notes.js'
import * as timeclock from './timeclock.js'
import * as settings from './settings.js'
import * as weather from './weather.js'
import { meetingsCached, dayKey, hm, shortDate } from './day.js'
import * as commute from './commute.js'
import * as projects from './projects.js'

const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const words = n => WORDS[n] ?? String(n)
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s
const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const minutesOf = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const clockWords = t => t === '12:00' ? 'twelve' : t === '12:30' ? 'half past twelve' : t
const ticked = n => n === 0 ? 'nothing ticked' : `${words(n)} ticked`
const trim = (s, n = 90) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s }

/** The first meeting that has not started and starts within the window, minutes away. */
export function nextMeeting(meetings = [], now = new Date(), windowMin = 45) {
  const cur = now.getHours() * 60 + now.getMinutes()
  const soon = meetings.filter(m => !m.allDay).map(m => ({ ...m, inMin: (minutesOf(m.start) ?? -1) - cur })).filter(m => m.inMin >= 0 && m.inMin <= windowMin)
  return soon.sort((a, b) => a.inMin - b.inMin)[0] || null
}

/**
 * facts: { status, hoursIn, outAt, tickedToday, tickedYesterday, workedYesterday, todayOpen, todayDone,
 *          arrivals: [{ title, tool }], deliveries: [{ title, arrived }], meetings: [{ subject, start, location, allDay }],
 *          weekWorked, lastDecision: { text, entry, date } | null, lunchAt }
 * Two lines at most. The first that applies wins its slot; a late clock or a weekend is the whole line.
 */
export function composeHero(f, now = new Date()) {
  const hour = now.getHours(), dow = now.getDay()
  const lines = []
  const push = (kind, text) => { if (text && lines.length < 2 && !lines.some(l => l.kind === kind)) lines.push({ kind, text }) }
  const working = f.status === 'in' || f.status === 'lunch'
  const done = (kind) => ({ variant: kind, lines })

  if (working && (hour >= 19 || (f.hoursIn || 0) >= 10)) {
    push('late', `Still on the clock at ${hhmm(now)}, ${Math.floor(f.hoursIn || 0)} hours in. Close the day.`)
    return done('late')
  }
  if ((dow === 0 || dow === 6) && !working) { push('weekend', `${DAYS[dow]}. The bench can wait.`); return done('weekend') }

  const next = nextMeeting(f.meetings, now)
  if (next) push('meeting', `${next.subject} ${next.inMin === 0 ? 'now' : next.inMin === 1 ? 'in a minute' : `in ${next.inMin} minutes`}${next.location ? `, ${next.location}` : ''}.`)
  // the drive, with live traffic, when it is that time of day (roadmap 120)
  if (f.commute?.ok && f.commute.text) push('commute', f.commute.text)
  const d = (f.deliveries || [])[0]
  if (d) push('delivery', `${d.title} ${d.arrived ? 'arrived' : 'arrives'} today.`)

  if (hour < 10) {
    if (f.tickedYesterday || f.workedYesterday) push('yesterday', `Yesterday: ${ticked(f.tickedYesterday || 0)}, ${hm(f.workedYesterday || 0)} on the clock.`)
    const a = f.arrivals || []
    if (a.length) {
      const tools = [...new Set(a.map(x => x.tool).filter(Boolean))]
      push('arrivals', `${cap(words(a.length))} new from ${tools.length ? tools.join(' and ') : 'the tools'} overnight.`)
    } else if ((f.meetings || []).length) {
      const timed = f.meetings.filter(m => !m.allDay && m.start)
      const n = f.meetings.length
      push('meetings', `${cap(words(n))} meeting${n === 1 ? '' : 's'} today${timed.length ? `, the first at ${timed[0].start}` : ''}.`)
    }
  } else if (working && f.lunchAt && (minutesOf(f.lunchAt) - (hour * 60 + now.getMinutes())) > 0 && (minutesOf(f.lunchAt) - (hour * 60 + now.getMinutes())) <= 30) {
    push('lunch', `Lunch at ${clockWords(f.lunchAt)}.`)
  } else if (hour < 17) {
    const total = (f.todayOpen || 0) + (f.todayDone || 0)
    if (total) push('progress', f.todayOpen === 0 ? `${cap(words(f.todayDone))} of ${words(total)} ticked. Today is clear.` : `${cap(words(f.todayDone || 0))} of ${words(total)} ticked.`)
    if (f.weekWorked) push('week', `${hm(f.weekWorked)} on the clock this week.`)
  } else {
    if (f.status === 'out' && f.outAt) push('evening', `Clocked out at ${f.outAt}. ${cap(ticked(f.tickedToday || 0))} today.`)
    else if (working) push('evening', `${cap(ticked(f.tickedToday || 0))} today. Time to close the day.`)
    if (dow === 5) push('friday', "The week's review is ready.")
  }
  // the plan (roadmap 121): behind, or a deadline inside three weeks
  const behind = (f.projects || []).filter(p => p.slack !== null && p.slack < 0).sort((a, b) => a.slack - b.slack)[0]
  const near = (f.projects || []).filter(p => p.daysLeft !== null && p.daysLeft >= 0 && p.daysLeft <= 15)[0]
  if (behind) push('project', `${behind.name}: ${behind.deadlineLabel} on ${shortDate(behind.deadline)}, ${-behind.slack} working day${behind.slack === -1 ? '' : 's'} behind the plan.`)
  else if (near) push('project', `${near.name}: ${near.deadlineLabel} ${near.daysLeft === 0 ? 'today' : `in ${near.daysLeft} working day${near.daysLeft === 1 ? '' : 's'}`}${near.slack !== null && near.slack >= 0 ? `, ${near.slack} of room` : ''}.`)
  if (!lines.length && f.lastDecision?.text) push('decision', `Last decision: ${trim(f.lastDecision.text)} (${f.lastDecision.entry}, ${shortDate(f.lastDecision.date)}).`)
  return done(lines[0]?.kind || 'quiet')
}

const local = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayOf = iso => iso ? local(new Date(iso)) : null
const TOOL = { issues: 'Issues', qms: 'QMS', bom: 'the BOM', planner: 'Planner', innovation: 'the dashboard' }

/** The facts, from what is already on the machine; nothing here waits for the network except the cached calendar. */
export async function facts(now = new Date()) {
  const today = dayKey(now)
  const yesterdayD = new Date(now); yesterdayD.setDate(yesterdayD.getDate() - 1)
  const yesterday = dayKey(yesterdayD)
  const snap = timeclock.snapshot()
  const inAt = snap.events.filter(e => e.kind === 'in').at(-1)?.at
  const outAt = snap.events.filter(e => e.kind === 'out').at(-1)?.at
  const days = timeclock.days(7)
  const monday = new Date(now); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); const mondayKey = dayKey(monday)
  const tasks = store.allTasks()
  const tickedOn = key => tasks.filter(t => t.done && t.completedBy === 'local' && dayOf(t.completedAt) === key).length
  const sinceEvening = new Date(yesterdayD); sinceEvening.setHours(18, 0, 0, 0)
  const arrivals = tasks.filter(t => t.source && t.source !== 'local' && !t.done && t.createdAt && new Date(t.createdAt) >= sinceEvening).map(t => ({ title: t.title, tool: TOOL[t.source] || t.source }))
  const deliveries = tasks.filter(t => !t.done && (dayOf(t.deliveredOn) === today || dayOf(t.meta?.deliveryDate) === today)).map(t => ({ title: t.title, arrived: dayOf(t.deliveredOn) === today }))
  const entries = notes.listEntries()
  const withDecision = entries.find(e => (e.decisions || []).length)
  return {
    status: snap.status,
    hoursIn: inAt ? (now - new Date(inAt)) / 3600000 : 0,
    outAt: outAt ? hhmm(new Date(outAt)) : null,
    tickedToday: tickedOn(today), tickedYesterday: tickedOn(yesterday),
    workedYesterday: days.find(d => d.date === yesterday)?.worked || 0,
    todayOpen: tasks.filter(t => t.lane === 'today' && !t.done).length,
    todayDone: tasks.filter(t => t.lane === 'today' && t.done && dayOf(t.completedAt) === today).length,
    arrivals, deliveries,
    meetings: await meetingsCached(now),
    weekWorked: days.filter(d => d.date >= mondayKey).reduce((s, d) => s + (d.worked || 0), 0),
    lastDecision: withDecision ? { text: withDecision.decisions.at(-1), entry: withDecision.title, date: withDecision.date } : null,
    lunchAt: settings.get().lunchAt || '12:00',
    commute: await commuteSoft(now, snap.status),
    projects: projectsSoft(today)
  }
}
/** The projects with a deadline, nearest first; a broken projects file never takes the hero down. */
function projectsSoft(today) {
  try { return projects.summaries(today).filter(p => p.deadline) } catch { return [] }
}
/** The drive for this hour, or null; a missing key, no home or no network never takes the hero down. */
async function commuteSoft(now, status) {
  const direction = commute.directionFor(now, status)
  if (!direction) return null
  try { const c = await commute.estimate({ direction, now: now.getTime() }); return c?.ok ? c : null } catch { return null }
}

export async function hero(now = new Date()) {
  const f = await facts(now)
  let w = null
  try { w = await weather.current() } catch { w = null }
  return { ...composeHero(f, now), weather: w && w.ok ? w : null }
}

export function registerRoutes(app) {
  app.get('/api/day/hero', wrap(async (_req, res) => res.json(await hero())))
}
