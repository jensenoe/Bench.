/**
 * Water and coffee at the right moments (roadmap 139). Before this, a nudge rode along with a ticked task
 * at random: nothing on a day of meetings, too much on a day of ticks. Now Bench. picks the moment:
 *
 *   tick      a task was ticked                        (the completion toast)
 *   focus     a focus session ran out                  (the focus toast)
 *   before    a meeting of an hour or more starts soon  (a Windows notification, from the timer)
 *   stretch   ninety minutes on the clock, no pause     (a Windows notification, from the timer)
 *
 * and what fits the hour: coffee in the morning and in the early-afternoon dip, at most two a day,
 * never after three (tea or water from then on); on a warm day water only, and sooner.
 * Never while off the clock, at lunch, in a meeting, on a weekend with quiet weekends, or in the quiet
 * hours. At most four a day, at least 75 minutes apart (50 on a warm day). "Not now" pushes the next one
 * back an hour. Counted in BENCH_USER_DIR/nudges.json, so a restart does not start over.
 *
 *   decide(facts, moment, now)     pure: facts in, { kind, text } or null out
 *   POST /api/nudge { moment }     { nudge } for tick and focus, recorded when given
 *   POST /api/nudge/later          pushes the next one back an hour
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as settings from './settings.js'
import * as timeclock from './timeclock.js'
import * as weather from './weather.js'
import { notify } from './notify.js'
import { meetingsCached } from './day.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = () => path.join(process.env.BENCH_USER_DIR || process.env.BENCH_SECRETS_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data'), 'nudges.json')
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))

export const CAP = 4, GAP_MIN = 75, HOT_GAP_MIN = 50, STRETCH_MIN = 90, HOT_C = 26, COFFEES = 2
export const MOMENTS = ['tick', 'focus', 'before', 'stretch']

const LINES = {
  water: ['Glass of water before the next one.', 'Water. You know the drill.', 'Refill the bottle while you are up.', 'Water first, then the next task.', 'Sip of water. Your brain runs on it.', 'Half a litre of water buys a clearer afternoon.'],
  coffee: ['A coffee would not be wrong now.', 'Small coffee, then the next thing.', 'Kettle on? A coffee suits this point in the day.', 'An espresso now and then is fine engineering practice.', 'Coffee break. Short one.'],
  tea: ['Too late in the day for coffee to be kind. Tea, or water.', 'A cup of tea keeps the evening yours.', 'Water or tea from here on. The night will thank you.'],
  hot: ['{temp} °C outside. Water, more than usual.', 'Warm day. A glass of water now, another in an hour.', 'The heat takes more than it looks like. Water.'],
  before: ['{subject} in {min} minutes. Fill your glass first.', 'A long one next: water before {subject}.'],
  stretch: ['{hours} on the clock without a pause. Water, and a minute at the window.', 'Stand up for a minute. The bench will wait. Then a glass of water.', 'Shoulders down, look at something far away, then a glass of water.']
}

const mins = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayOfYear = d => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000)
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')

/** Inside the quiet hours, which may wrap past midnight (19:00 to 07:00). */
export function inQuiet(now, from, to) {
  const f = mins(from), t = mins(to), n = now.getHours() * 60 + now.getMinutes()
  if (f === null || t === null || f === t) return false
  return f < t ? n >= f && n < t : n >= f || n < t
}
const inMeeting = (meetings, now) => {
  const n = now.getHours() * 60 + now.getMinutes()
  return (meetings || []).some(m => !m.allDay && mins(m.start) !== null && mins(m.end) !== null && mins(m.start) <= n && n < mins(m.end))
}
/** The next timed meeting that lasts an hour or more and starts within fifteen minutes. */
export const longMeetingSoon = (meetings, now) => {
  const n = now.getHours() * 60 + now.getMinutes()
  return (meetings || []).find(m => !m.allDay && mins(m.start) !== null && mins(m.end) !== null && mins(m.end) - mins(m.start) >= 60 && mins(m.start) - n > 0 && mins(m.start) - n <= 15) || null
}

/**
 * facts: { on, status: 'in'|'lunch'|'out'|'off', since (ISO: the later of clock-in and back-from-lunch),
 *          meetings: [{ subject, start, end, allDay }], temp, quietFrom, quietTo, quietWeekends,
 *          day: { count, last (ISO), lastKind, coffees, snoozeUntil (ISO) } }
 * Returns { kind, text } or null. Pure, so the tests can walk a day through it.
 */
export function decide(f, moment, now = new Date()) {
  if (!f?.on || !MOMENTS.includes(moment)) return null
  const dow = now.getDay()
  if (f.quietWeekends !== false && (dow === 0 || dow === 6)) return null
  if (inQuiet(now, f.quietFrom, f.quietTo)) return null
  if (f.status !== 'in') return null
  if (inMeeting(f.meetings, now)) return null
  const d = f.day || {}
  if ((d.count || 0) >= CAP) return null
  if (d.snoozeUntil && new Date(d.snoozeUntil) > now) return null
  const hot = Number(f.temp) >= HOT_C
  const gap = (hot ? HOT_GAP_MIN : GAP_MIN) * 60_000
  if (d.last && now - new Date(d.last) < gap) return null
  const salt = dayOfYear(now) + (d.count || 0)
  const pick = (kind, v = {}) => ({ kind: kind === 'hot' || kind === 'before' || kind === 'stretch' ? (kind === 'stretch' ? 'pause' : 'water') : kind, text: fill(LINES[kind][salt % LINES[kind].length], v) })

  if (moment === 'before') {
    const m = longMeetingSoon(f.meetings, now); if (!m) return null
    return pick('before', { subject: m.subject || 'The meeting', min: mins(m.start) - (now.getHours() * 60 + now.getMinutes()) })
  }
  if (moment === 'stretch') {
    const since = new Date(d.last && (!f.since || d.last > f.since) ? d.last : f.since || now)
    const gone = (now - since) / 60_000
    if (gone < STRETCH_MIN) return null
    const h = Math.floor(gone / 60), m = Math.round(gone % 60)
    return pick('stretch', { hours: m ? `${h} h ${m}` : `${h} hours` })
  }
  if (hot) return pick('hot', { temp: Math.round(Number(f.temp)) })
  const n = now.getHours() * 60 + now.getMinutes()
  const coffeeHour = (n >= 7 * 60 && n < 10 * 60 + 30) || (n >= 13 * 60 + 30 && n < 15 * 60)
  if (coffeeHour && (d.coffees || 0) < COFFEES && d.lastKind !== 'coffee') return pick('coffee')
  if (n >= 15 * 60 && d.lastKind !== 'tea' && salt % 2 === 0) return pick('tea')
  return pick('water')
}

// ── the day's count ───────────────────────────────────────────────────
function load(now = new Date()) {
  let s = {}
  try { s = JSON.parse(fs.readFileSync(FILE(), 'utf8')) } catch { s = {} }
  return s.date === dayKey(now) ? s : { date: dayKey(now), count: 0, last: null, lastKind: null, coffees: 0, snoozeUntil: null }
}
function save(s) {
  try { fs.mkdirSync(path.dirname(FILE()), { recursive: true }); fs.writeFileSync(FILE(), JSON.stringify(s, null, 2)) } catch (err) { console.warn('[nudges] not saved:', err.message) }
}
function record(n, now = new Date()) {
  const s = load(now)
  s.count = (s.count || 0) + 1; s.last = now.toISOString(); s.lastKind = n.kind
  if (n.kind === 'coffee') s.coffees = (s.coffees || 0) + 1
  save(s)
}
export function later(now = new Date(), minutes = 60) {
  const s = load(now); s.snoozeUntil = new Date(now.getTime() + minutes * 60_000).toISOString(); save(s); return s
}

/** What the rules need, from what Bench. already knows; the network parts are soft. */
export async function facts(now = new Date()) {
  const st = settings.get()
  const snap = timeclock.snapshot()
  const at = kind => snap.events.filter(e => e.kind === kind).at(-1)?.at || null
  const since = [at('in'), at('lunchIn')].filter(Boolean).sort().at(-1) || null
  let meetings = []
  try { meetings = await meetingsCached(now) } catch { meetings = [] }
  let temp = null
  try { const w = await weather.current(); temp = w?.ok ? w.temp : null } catch { temp = null }
  return { on: st.nudges !== false, status: snap.status, since, meetings, temp, quietFrom: st.quietFrom, quietTo: st.quietTo, quietWeekends: st.quietWeekends, day: load(now) }
}

/** One moment: decide, and record when a nudge is given. */
export async function moment(name, now = new Date()) {
  const n = decide(await facts(now), name, now)
  if (n) record(n, now)
  return n
}

const TITLE = { water: 'Water.', coffee: 'Coffee.', tea: 'Tea.', pause: 'A pause.' }
/** The timer's moments go out as Windows notifications: a long meeting ahead, or a long stretch. */
export async function tick(now = new Date()) {
  for (const name of ['before', 'stretch']) {
    const n = await moment(name, now)
    if (n) { notify({ title: TITLE[n.kind] || 'Water.', body: n.text, route: '#/' }); return n }
  }
  return null
}

let timer = null
export function start() {
  if (timer) return
  const run = () => tick().catch(err => console.warn('[nudges]', err.message))
  timer = setInterval(run, 5 * 60_000)
}

export function registerRoutes(app) {
  app.post('/api/nudge', wrap(async (req, res) => {
    const name = String(req.body?.moment || '')
    if (!['tick', 'focus'].includes(name)) return res.status(400).json({ error: 'tick or focus' })
    res.json({ nudge: await moment(name) })
  }))
  app.post('/api/nudge/later', wrap((_req, res) => res.json({ snoozeUntil: later().snoozeUntil })))
  app.get('/api/nudge', wrap((_req, res) => res.json(load())))
}
