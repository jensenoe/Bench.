/**
 * Source health (roadmap 174): can Bench. trust what it reads? On 7 Oct the Structured BOM lost its sign-in and
 * nobody saw it for five days, because a site source that fails once is left alone by the background poll. This
 * module says, per source, whether it reads, and tells you once when one drops.
 *
 *   health(sources, { now, syncMinutes, startedAt })   pure; `sources` is what sourceStatus() gives, plus `cards`
 *     -> { state, sources: [{ key, label, state, reason, since, lastSync, action }], at, staleAfterMinutes }
 *
 * The states, checked in this order:
 *   off      not available here (the web version for a site tool), or never connected and never wanted:
 *            no lastSync and not signed in. Neutral, not a warning.
 *   signin   the last read said needs-signin, or the session is known to be gone (signedIn === false), or for
 *            Microsoft 365 there is no account any more.
 *   error    any other error on the last read.
 *   stale    no successful read for longer than three sync intervals or two hours, whichever is longer, counted
 *            from when Bench. started or woke up, so a night with the laptop closed is not a fault.
 *   suspect  it reads, but probably not the right thing: none of the tickets are yours while the tool holds more
 *            than 50, or the Innovation dashboard gave nothing through its page reading.
 *   ok       it reads.
 * The overall state is the worst one (signin, error, stale, suspect, ok, off).
 *
 *   GET /api/sources/health    the same, for the light in the top bar and the Tools page
 *   watch(now)                 the alerts tick: a desktop notification when a source drops from reading to
 *                              signin, error or stale. Once per drop and at most once a day per source (the
 *                              'sources' category in notify-policy.js). Memory in BENCH_USER_DIR/source-health.json.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourceStatus, SOURCES } from './sources/index.js'
import { getMeta, allTasks } from './store.js'
import { getAccount, isConfigured } from './auth.js'
import { notify } from './notify.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = () => path.join(process.env.BENCH_USER_DIR || process.env.BENCH_SECRETS_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data'), 'source-health.json')

export const STATES = ['off', 'ok', 'suspect', 'stale', 'error', 'signin']
/** Worse is higher. */
export const RANK = Object.fromEntries(STATES.map((s, i) => [s, i]))
/** A drop worth a desktop notification. Suspect is not one: it still reads. */
export const DROPS = new Set(['signin', 'error', 'stale'])
/** More than this many in the tool and none yours: the match is probably wrong. */
export const SUSPECT_TOTAL = 50
export const STALE_FLOOR_MS = 2 * 60 * 60_000
/** A read that failed once may be a blip; an error is told only when it has lasted this long. */
export const ERROR_GRACE_FLOOR_MS = 10 * 60_000
/** A gap this long between two ticks means the machine slept: the stale clock starts again. */
export const WAKE_GAP_MS = 5 * 60_000

export const syncMinutesFromEnv = () => { const n = Number(process.env.SYNC_INTERVAL_MINUTES ?? 2); return Number.isFinite(n) && n >= 0 ? n : 2 }
/** Three sync intervals or two hours, whichever is longer. */
export const staleAfterMs = (syncMinutes = 2) => Math.max(3 * Math.max(0, Number(syncMinutes) || 0) * 60_000, STALE_FLOOR_MS)
export const errorGraceMs = (syncMinutes = 2) => Math.max(3 * Math.max(0, Number(syncMinutes) || 0) * 60_000, ERROR_GRACE_FLOOR_MS)

// ── words ─────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ymd = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
/** "Wed 7 Oct" */
export const day = d => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
/** "at 13:09" today, "on Wed 7 Oct" before. */
export const whenText = (iso, now = new Date()) => { const d = new Date(iso); return ymd(d) === ymd(now) ? `at ${hhmm(d)}` : `on ${day(d)}` }
const time = v => { const t = v ? new Date(v).getTime() : NaN; return Number.isNaN(t) ? null : t }
const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t }
const NOUN = { issues: 'tickets', qms: 'tickets', bom: 'parts' }
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`

/** An error code from a source, as one plain sentence. */
export function errorText(error) {
  const e = String(error || '')
  if (e === 'timeout' || /timeout/i.test(e)) return 'The tool did not answer in time.'
  if (e === 'needs-admin-consent') return 'Waits for an admin to approve the app for the issue list.'
  if (/^HTTP 5\d\d/.test(e)) return `The tool had a fault (${e}).`
  if (/^HTTP \d+/.test(e)) return `The tool refused the read (${e}).`
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network|fetch failed/i.test(e)) return 'The tool could not be reached.'
  const t = clip(e, 120).replace(/[.\s]+$/, '')
  return `The last read failed: ${t}.`
}

// ── the rules ─────────────────────────────────────────────────────────
/**
 * One source. `s` is a sourceStatus() row: { label, kind, available, signedIn, lastSync, lastAttempt, error,
 * count, total, via, cards }. For Microsoft 365 (kind 'graph') signedIn says whether an account is there.
 */
export function judge(key, s = {}, { now = new Date(), syncMinutes = 2, startedAt = null } = {}) {
  const graph = s.kind === 'graph'
  const label = s.label || key
  const lastSync = s.lastSync || null
  const signAction = graph ? 'connect' : 'signin'
  const out = (state, reason, action = null, since = null) => ({ key, label, kind: s.kind || null, state, reason, since, lastSync, action, count: s.count ?? null, total: s.total ?? null, cards: s.cards ?? null })
  // the last good moment is when the trouble started; without one, the first failed try
  const troubleSince = lastSync || s.lastAttempt || null

  if (s.available === false) return out('off', graph ? 'Microsoft 365 is not set up in this copy.' : 'Reads only in the desktop app.')
  const wanted = Boolean(lastSync) || s.signedIn === true
  if (!wanted) return out('off', graph ? 'Not connected.' : 'Not signed in.', signAction)

  if (s.error === 'needs-signin' || s.error === 'not-signed-in' || s.signedIn === false) {
    const reason = graph ? (s.signedIn === false ? 'Microsoft 365 is not connected.' : 'The Microsoft 365 sign-in has expired.') : 'Wants a sign-in. Nothing reads until then.'
    return out('signin', reason, signAction, troubleSince)
  }
  if (s.error && s.error !== 'desktop-only') return out('error', errorText(s.error), 'sync', troubleSince)
  if (s.error === 'desktop-only') return out('off', 'Reads only in the desktop app.')

  if (!lastSync) return out('ok', 'Signed in, not read yet.', 'sync')
  const nowMs = now.getTime()
  const from = Math.max(time(lastSync) ?? 0, time(startedAt) ?? 0)
  if (nowMs - from > staleAfterMs(syncMinutes)) return out('stale', `No read since ${whenText(lastSync, now).replace(/^(at|on) /, '')}.`, 'sync', lastSync)

  const count = Number(s.count ?? 0), total = s.total === null || s.total === undefined ? null : Number(s.total)
  if (count === 0 && total !== null && total > SUSPECT_TOTAL) {
    return out('suspect', `Reads ${total} ${NOUN[key] || 'items'} but none are yours; the match may be wrong.`, 'sync', lastSync)
  }
  if (key === 'innovation' && s.via === 'page' && count === 0) {
    return out('suspect', 'Reads the dashboard page but finds no items; the page may have changed.', 'sync', lastSync)
  }
  return out('ok', total !== null ? `${count} yours of ${total}.` : `${plural(count, 'item')} yours.`)
}

/** Every source, in SOURCES order, and the worst state. Pure. */
export function health(sources = {}, opts = {}) {
  const now = opts.now || new Date()
  const syncMinutes = opts.syncMinutes ?? 2
  const list = Object.entries(sources || {}).map(([key, s]) => judge(key, s, { ...opts, now, syncMinutes }))
  const state = list.reduce((w, s) => RANK[s.state] > RANK[w] ? s.state : w, 'off')
  return { state, sources: list, at: now.toISOString(), staleAfterMinutes: Math.round(staleAfterMs(syncMinutes) / 60_000) }
}

/** The notification for a drop: "Structured BOM needs a sign-in." / "Its 16 cards stopped updating on Wed 7 Oct." */
export function dropMessage(s, now = new Date()) {
  const title = s.state === 'signin' ? `${s.label} needs a sign-in.`
    : s.state === 'error' ? `${s.label} stopped reading.`
    : `${s.label} is out of date.`
  const n = Number(s.cards ?? s.count ?? 0)
  const stopped = s.since ? `${n > 0 ? `Its ${plural(n, 'card')}` : 'It'} stopped updating ${whenText(s.since, now)}.` : 'It has not read yet.'
  const body = s.state === 'error' ? `${s.reason} ${stopped}` : stopped
  return { title, body, route: '#/tools', category: 'sources', key: s.key }
}

// ── the live picture ──────────────────────────────────────────────────
const bootedAt = new Date()
let awakeSince = bootedAt.toISOString()
let lastTick = null
/** For the tests: pretend the server started (or woke) at this moment. */
export function _setAwake(iso, tickAt = null) { awakeSince = iso; lastTick = tickAt }

/** What sourceStatus() knows, with Microsoft 365's account and error and each source's open cards on the board. */
export async function collect() {
  const status = await sourceStatus()
  const meta = getMeta() || {}
  const account = await getAccount().catch(() => null)
  const open = {}
  for (const t of allTasks()) if (!t.done && t.source) open[t.source] = (open[t.source] || 0) + 1
  const out = {}
  for (const key of Object.keys(SOURCES)) {
    const s = { ...(status[key] || {}), cards: open[key] || 0 }
    if (s.kind === 'graph') {
      s.available = isConfigured()
      s.signedIn = account ? true : false
      // Planner keeps its last error on the board's meta, not on the source
      if (!s.error && meta.lastSyncError) s.error = meta.lastSyncError
    }
    out[key] = s
  }
  return out
}

export async function current(now = new Date()) {
  return health(await collect(), { now, syncMinutes: syncMinutesFromEnv(), startedAt: awakeSince })
}

// ── telling you ───────────────────────────────────────────────────────
function load() { try { const s = JSON.parse(fs.readFileSync(FILE(), 'utf8')); return s && typeof s === 'object' ? s : {} } catch { return {} } }
function save(s) { try { fs.mkdirSync(path.dirname(FILE()), { recursive: true }); fs.writeFileSync(FILE(), JSON.stringify(s, null, 2)) } catch (err) { console.warn('[sources] not saved:', err.message) } }

/**
 * Which drops to tell, pure. `armed[key]` is true while the source has been seen reading since the last note;
 * a source never seen counts as armed when it has ever read (so the BOM that dropped on 7 Oct is told once).
 * Returns { tell: [source rows], armed: the new memory }.
 */
export function drops(h, armed = {}, { now = new Date(), syncMinutes = 2, startedAt = null } = {}) {
  const next = { ...armed }
  const tell = []
  for (const s of h.sources) {
    const was = s.key in next ? next[s.key] === true : Boolean(s.lastSync)
    if (s.state === 'ok' || s.state === 'suspect') { next[s.key] = true; continue }
    if (!DROPS.has(s.state)) { next[s.key] = was; continue }
    if (!was) { next[s.key] = false; continue }
    if (s.state === 'error') {
      // one failed read is not a drop yet: wait until it has lasted a few sync intervals
      const from = Math.max(time(s.since) ?? 0, time(startedAt) ?? 0)
      if (now.getTime() - from < errorGraceMs(syncMinutes)) { next[s.key] = true; continue }
    }
    tell.push(s)
    next[s.key] = false
  }
  return { tell, armed: next }
}

/** The alerts tick. Returns how many notifications went out. */
export async function watch(now = new Date()) {
  if (lastTick && now.getTime() - new Date(lastTick).getTime() > WAKE_GAP_MS) awakeSince = now.toISOString()
  lastTick = now.toISOString()
  const syncMinutes = syncMinutesFromEnv()
  const h = health(await collect(), { now, syncMinutes, startedAt: awakeSince })
  const mem = load()
  const { tell, armed } = drops(h, mem.armed || {}, { now, syncMinutes, startedAt: awakeSince })
  let sent = 0
  for (const s of tell) if (notify(dropMessage(s, now), { now })) sent++
  if (JSON.stringify(armed) !== JSON.stringify(mem.armed || {})) save({ ...mem, armed })
  return sent
}

const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))
export function registerRoutes(app) {
  app.get('/api/sources/health', wrap(async (_req, res) => res.json(await current())))
}
