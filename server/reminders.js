/**
 * Reminders that run on a timer (roadmap 71 and friends). One tick every ten minutes, the first thirty
 * seconds after start. Nothing in here may throw out of the interval; each job catches its own errors.
 *
 *   chase    an ordered part that is not delivered and is due inside the supplier's lead time gets one
 *            notification per task per day ("Chase it.")
 *   drift    Monday morning: the sheet and Bench disagree on N days (roadmap 74)
 *   mirror   today's backups go to OneDrive once a day (roadmap 96)
 *
 * What was already said is remembered in BENCH_USER_DIR/reminders.json, so a restart does not repeat it.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { notify } from './notify.js'
import * as store from './store.js'
import * as leadtimes from './leadtimes.js'
import * as drift from './drift.js'
import * as backup from './backup.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(
  process.env.BENCH_USER_DIR || process.env.BENCH_SECRETS_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data'),
  'reminders.json'
)
export const TICK_MS = 10 * 60_000
export const FIRST_MS = 30_000
export const DEFAULT_CHASE_DAYS = 7
const DAY = 86400000

// ── memory ────────────────────────────────────────────────────────────
let memo = null
function load() {
  if (memo) return memo
  try { memo = JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { memo = {} }
  if (!memo.chased || typeof memo.chased !== 'object') memo.chased = {}
  return memo
}
function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(memo, null, 2)); fs.renameSync(FILE + '.tmp', FILE)
  } catch (err) { console.warn('[reminders] not saved:', err.message) }
}

// ── dates, said the Bench way ("Tue 22 Sep") ──────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const fmtDate = (iso) => { if (!iso) return ''; const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` }
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysUntil = (iso, today) => { const d = new Date(iso.slice(0, 10) + 'T12:00:00'); const t = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12); return Math.round((d - t) / DAY) }

// ── chase ─────────────────────────────────────────────────────────────
/**
 * Pure selection. Open, ordered, not delivered, with a need-by date that is inside the supplier's learned
 * lead time (median) or seven days when the supplier is unknown. Late parts count too (daysLeft below zero).
 * Returns [{ id, title, supplier, poNumber, dueDate, daysLeft, leadDays, orderedOn }], soonest first.
 */
export function chaseList(tasks, stats = [], today = new Date()) {
  const byKey = new Map(stats.map(s => [s.key, s]))
  const out = []
  for (const t of tasks) {
    if (t.done) continue
    const orderedOn = t.orderedOn || t.meta?.orderedOn
    const deliveredOn = t.deliveredOn
    const dueDate = t.dueDate || t.meta?.needBy
    if (!orderedOn || deliveredOn || !dueDate) continue
    const supplier = t.supplier || t.meta?.supplier || null
    const s = supplier ? byKey.get(leadtimes.key(supplier)) : null
    const leadDays = s?.median ?? DEFAULT_CHASE_DAYS
    const daysLeft = daysUntil(dueDate, today)
    if (daysLeft > leadDays) continue
    out.push({ id: t.id, title: t.title, supplier, poNumber: t.poNumber || t.meta?.orderNumber || null, dueDate: dueDate.slice(0, 10), daysLeft, leadDays, orderedOn: orderedOn.slice(0, 10) })
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.title.localeCompare(b.title))
}
/** The current list, for the Procurement page. */
export const chase = () => chaseList(store.allTasks(), leadtimes.stats())

export const chaseMessage = (c) => ({
  title: 'Chase it.',
  body: `${c.title}: ${c.supplier || 'the supplier'}, PO ${c.poNumber || 'none'}, needed ${fmtDate(c.dueDate)}.`,
  route: '#/procurement'
})

function chaseTick(today) {
  const m = load()
  const date = ymd(today)
  let sent = 0
  for (const c of chase()) {
    if (m.chased[c.id] === date) continue
    notify(chaseMessage(c))
    m.chased[c.id] = date
    sent++
  }
  // forget tasks that are no longer chased, so the file does not grow with every order ever placed
  const live = new Set(store.allTasks().map(t => t.id))
  for (const id of Object.keys(m.chased)) if (!live.has(id)) delete m.chased[id]
  if (sent) save()
  return sent
}

// ── Monday drift ──────────────────────────────────────────────────────
export const driftMessage = (n) => ({ title: 'The sheet.', body: `The sheet and Bench disagree on ${n} ${n === 1 ? 'day' : 'days'}. The Hours page marks them.`, route: '#/hours' })
async function driftTick(today) {
  if (today.getDay() !== 1 || today.getHours() < 7 || today.getHours() >= 12) return false
  const m = load()
  const date = ymd(today)
  if (m.drift === date) return false
  const r = await drift.check(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  if (!r.ok) return false                       // no token or a Graph error: try again next Monday tick
  m.drift = date; save()
  if (r.rows.length) { notify(driftMessage(new Set(r.rows.map(x => x.date)).size)); return true }
  return false
}

// ── the tick ──────────────────────────────────────────────────────────
const jobs = [
  ['chase', (now) => chaseTick(now)],
  ['drift', (now) => driftTick(now)],
  ['mirror', () => backup.mirrorToOneDrive()]
]
export async function tick(now = new Date()) {
  const out = {}
  for (const [name, job] of jobs) {
    try { out[name] = await job(now) } catch (err) { out[name] = null; console.warn(`[reminders:${name}]`, err.message) }
  }
  return out
}

let timers = []
export function start() {
  if (timers.length) return
  const run = () => tick().catch(err => console.warn('[reminders]', err.message))
  timers = [setTimeout(run, FIRST_MS), setInterval(run, TICK_MS)]
  timers.forEach(t => t.unref?.())
}
export function stop() { timers.forEach(t => clearTimeout(t)); timers.forEach(t => clearInterval(t)); timers = [] }

/** Express routes; `wrap` is the server's promise-to-response helper. */
export function registerRoutes(app, wrap) {
  app.get('/api/reminders/chase', wrap((_req, res) => res.json(chase())))
}
