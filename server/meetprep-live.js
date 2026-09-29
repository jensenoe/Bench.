/**
 * Meeting prep on the live data (roadmap 163): the pure matcher in meetprep.js, fed today's calendar
 * (day.js meetingsCached, the cache the hero and the five-minute reminder read) and the board, the Logbook,
 * the machines, the plans and the innovation portfolio. Read only: nothing here writes a task or an entry;
 * "Log this meeting" creates its entry through POST /api/logbook when it is clicked.
 *
 *   GET /api/meetprep/next   { meeting, phase, minutes, prep } for the Home card, or { meeting: null }
 *   GET /api/meetprep/:id    the same for one of today's meetings, 404 when it is not on today's calendar
 *
 * prepRoute(meeting) gives the five-minute reminder its click route: the prep page when there is something
 * to bring, nothing (so the reminder keeps its own) otherwise. It never throws.
 */
import * as store from './store.js'
import * as notes from './notes.js'
import * as projects from './projects.js'
import * as settings from './settings.js'
import { machinesFrom, readAliases } from './machines.js'
import { portfolio } from './portfolio.js'
import { meetingsCached, dayKey } from './day.js'
import { prepFor, pickNext, phaseOf, minutesOf, joinOf, loggedOf } from './meetprep.js'

const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))

/** Everything the matcher reads, once per request. */
export function world(now = new Date()) {
  const tasks = store.allTasks()
  const entries = notes.listEntries()
  let maps = []
  try { maps = notes.listMaps() } catch { maps = [] }
  let machines = []
  try { machines = machinesFrom({ tasks, entries, maps, ...readAliases() }) } catch { machines = [] }
  let plans = []
  try { plans = projects.list().filter(p => !p.archived) } catch { plans = [] }
  let folio = []
  try { folio = portfolio(tasks, { entries, maps }) } catch { folio = [] }
  return { tasks, entries, machines, projects: plans, portfolio: folio, me: settings.get().name || '', today: dayKey(now) }
}

/** What the page needs of a meeting, and no more (the Outlook web link and ids of people stay out). */
const publicMeeting = m => ({
  id: m.id, subject: m.subject || 'Meeting', start: m.start || '', end: m.end || '', location: m.location || null,
  organizer: m.organizer || null, attendees: m.attendees || [], joinUrl: joinOf(m)
})
const answer = (m, phase, prep, now) => ({ meeting: publicMeeting(m), phase, minutes: minutesOf(m, now), prep })

export async function next(now = new Date()) {
  const meetings = await meetingsCached(now)
  const w = world(now)
  const hit = pickNext(meetings, now, m => prepFor(m, w), m => Boolean(loggedOf(m, w.entries, w.today)))
  return hit ? answer(hit.meeting, hit.phase, hit.prep, now) : { meeting: null }
}
export async function one(id, now = new Date()) {
  const m = (await meetingsCached(now)).find(x => x.id === id)
  if (!m) throw Object.assign(new Error('That meeting is not on today\'s calendar.'), { status: 404 })
  return answer(m, phaseOf(m, now), prepFor(m, world(now)), now)
}

/** The reminder's click route: { route } to the prep page when it has something to bring, else {}. */
export function prepRoute(m, now = new Date()) {
  try {
    if (!m?.id) return {}
    return prepFor(m, world(now)).empty ? {} : { route: `#/meeting?id=${encodeURIComponent(m.id)}` }
  } catch { return {} }
}

export function registerRoutes(app) {
  app.get('/api/meetprep/next', wrap(async (_req, res) => res.json(await next())))
  app.get('/api/meetprep/:id', wrap(async (req, res) => res.json(await one(String(req.params.id || '')))))
}
