/**
 * Time clock.
 *
 * Punches go into the Zeiterfassung workbook on OneDrive through the Graph Excel API:
 *   C = Vormittag kommt   D = Vormittag geht   E = Nachmittag kommt   F = Nachmittag geht   G = Pause
 * One sheet per month (Januar .. Dezember), one row per day. The day row is found by reading
 * column A (a date chain) rather than trusting a fixed offset, with the known layout as fallback
 * (Januar starts at row 9, every other month at row 7).
 *
 * Rules, as asked:
 *   - clock in rounds down to 5 minutes, clock out rounds up, lunch punches are exact
 *   - 12:00 fires a lunch notification
 *   - clocking out for lunch starts the break; lunch ends at 12:30 by itself if the break
 *     began before then (a late lunch is ended by hand)
 *
 * The day's state is per user (it is one person's attendance), never in the shared data folder.
 * Punches that could not be written (offline, not signed in) are kept and retried on every tick.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTokenSilent } from './auth.js'
import { bridge } from './bridge.js'
import * as settings from './settings.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATE_FILE = path.join(
  process.env.BENCH_USER_DIR || process.env.BENCH_SECRETS_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data'),
  'timeclock.json'
)

const GRAPH = process.env.GRAPH_BASE || 'https://graph.microsoft.com/v1.0'   // override only for local tests
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const COL = { in: 'C', lunchOut: 'D', lunchIn: 'E', out: 'F', pause: 'G' }
const hm = (str, fb) => { const m = /^(\d{1,2}):(\d{2})$/.exec(str || ''); return m ? { h: +m[1], m: +m[2] } : fb }
const LUNCH_AT = () => hm(settings.get().lunchAt, { h: 12, m: 0 })
const LUNCH_ENDS = () => hm(settings.get().lunchEnds, { h: 12, m: 30 })
const ROUND_MIN = () => settings.get().roundMinutes || 5

// ── workbook location ────────────────────────────────────────────────
function workbookBase(year) {
  // A sharing link wins (works for any copy the link points at); otherwise the path template from settings.
  const link = settings.get().timesheetUrl
  if (link) {
    const token = 'u!' + Buffer.from(link).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
    return `${GRAPH}/shares/${token}/driveItem/workbook`
  }
  const p = settings.timesheetPath(year).replace(/^\/+/, '')
  return `${GRAPH}/me/drive/root:/${p.split('/').map(encodeURIComponent).join('/')}:/workbook`
}
export const workbookLabel = (year = new Date().getFullYear()) =>
  settings.get().timesheetUrl ? 'the shared workbook link' : settings.timesheetPath(year)
/** Settings changed: forget cached sheet names and row so the next write re-resolves. */
export function invalidate() { sheetNames.clear(); if (state.sheet) { state.sheet = null; save() } }

// ── state ─────────────────────────────────────────────────────────────
const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fresh = (date = today()) => ({ date, status: 'off', events: [], notified: {}, sheet: null, unclosed: null })

let state = load()
function load() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    return s.date ? s : fresh()
  } catch { return fresh() }
}
function save() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  const tmp = STATE_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
  fs.renameSync(tmp, STATE_FILE)
}

/** One day's punches folded into numbers: worked and break in ms, first in, last out. */
export function summarize(events = [], asOf = null) {
  const t = k => events.filter(e => e.kind === k).at(-1)?.at
  const ms = iso => new Date(iso).getTime()
  const start = t('in'); if (!start) return { worked: 0, breakMs: 0, in: null, out: null, open: false }
  const lunchOut = t('lunchOut'), lunchIn = t('lunchIn'), out = t('out')
  const end = out ? ms(out) : (asOf ? asOf.getTime() : null)
  let worked = 0, breakMs = 0
  if (lunchOut) {
    worked += ms(lunchOut) - ms(start)
    if (lunchIn) { breakMs = ms(lunchIn) - ms(lunchOut); if (end) worked += end - ms(lunchIn) }
    else if (end) breakMs = end - ms(lunchOut)
  } else if (end) worked += end - ms(start)
  return { worked: Math.max(0, worked), breakMs: Math.max(0, breakMs), in: start, out: out || null, open: !out }
}

/** New day: yesterday is folded into history (90 days), an open day is flagged, unwritten punches carry over. */
function rollover() {
  const d = today()
  if (state.date === d) return
  const unclosed = (state.status === 'in' || state.status === 'lunch') ? { date: state.date, status: state.status } : null
  const pending = state.events.filter(e => !e.written)   // keep retrying yesterday's unwritten punches
  const history = (state.history || []).filter(h => h.date !== state.date)
  if (state.events.some(e => e.kind === 'in')) history.push({ date: state.date, ...summarize(state.events), open: !!unclosed })
  state = { ...fresh(d), unclosed, pendingFromEarlier: pending, history: history.slice(-90) }
  save()
}

/** The last n days including today, for the week strip. */
export function days(n = 7) {
  rollover()
  const out = []
  const hist = new Map((state.history || []).map(h => [h.date, h]))
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const key = today(d)
    if (key === state.date) out.push({ date: key, ...summarize(state.events, new Date()), today: true })
    else out.push(hist.get(key) ? { ...hist.get(key), today: false } : { date: key, worked: 0, breakMs: 0, in: null, out: null, open: false, today: false })
  }
  return out
}

// ── time helpers ──────────────────────────────────────────────────────
/**
 * Rounding, per punch:
 *   clock in      down to the previous 5 (08:08 -> 08:05)
 *   clock out     up to the next 5       (17:01 -> 17:05)
 *   lunch out/in  the exact minute; the break is what it was
 */
export const roundFor = (kind, d) => {
  const r = new Date(d); r.setSeconds(0, 0)
  const step = ROUND_MIN()
  if (kind === 'in') r.setMinutes(Math.floor(r.getMinutes() / step) * step)
  else if (kind === 'out') { const up = Math.ceil(r.getMinutes() / step) * step; r.setMinutes(0); r.setMinutes(up) }   // 60 rolls the hour
  return r
}
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const fraction = (d) => (d.getHours() * 60 + d.getMinutes()) / 1440   // Excel time = fraction of a day
const at = (d, { h, m }) => { const r = new Date(d); r.setHours(h, m, 0, 0); return r }

// ── Graph / Excel ─────────────────────────────────────────────────────
async function graph(token, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Graph ${res.status} on ${url.replace(GRAPH, '')} ${body.slice(0, 240)}`)
  }
  return res.status === 204 ? null : res.json()
}

const sheetNames = new Map()   // year -> [names]
async function sheetFor(token, date) {
  const year = date.getFullYear()
  const want = MONTHS[date.getMonth()]
  if (!sheetNames.has(year)) {
    const r = await graph(token, `${workbookBase(year)}/worksheets?$select=name`)
    sheetNames.set(year, (r.value || []).map(w => w.name))
  }
  const norm = s => s.toLowerCase().replace('ä', 'a').replace('ae', 'a').slice(0, 3)
  const hit = sheetNames.get(year).find(n => n === want) || sheetNames.get(year).find(n => norm(n) === norm(want))
  if (!hit) throw new Error(`No sheet for ${want} in the ${year} workbook`)
  return hit
}

/** Row of this date in the month sheet: read column A, match the date serial; fall back to the known layout. */
async function rowFor(token, date, sheet) {
  if (state.sheet?.name === sheet && state.sheet?.date === today(date) && state.sheet.row) return state.sheet.row
  const base = workbookBase(date.getFullYear())
  const serial = Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(1899, 11, 30)) / 86400000)
  let row = null
  try {
    const r = await graph(token, `${base}/worksheets('${encodeURIComponent(sheet)}')/range(address='A1:A45')?$select=values`)
    const idx = (r.values || []).findIndex(([v]) => typeof v === 'number' && Math.round(v) === serial)
    if (idx >= 0) row = idx + 1
  } catch (err) { console.warn('[timeclock] column A read failed, using layout fallback:', err.message) }
  if (!row) row = (date.getMonth() === 0 ? 8 : 6) + date.getDate()
  state.sheet = { name: sheet, date: today(date), row }
  save()
  return row
}

async function writeCell(token, date, col, value, numberFormat = 'h:mm') {
  const sheet = await sheetFor(token, date)
  const row = await rowFor(token, date, sheet)
  const url = `${workbookBase(date.getFullYear())}/worksheets('${encodeURIComponent(sheet)}')/range(address='${col}${row}')`
  const r = await graph(token, url, { method: 'PATCH', body: JSON.stringify({ values: [[value]] }) })
  // A cell still on "General" would show 0.336 instead of 08:05.
  const fmt = r?.numberFormat?.[0]?.[0] || ''
  if (!/[hH].*mm/.test(fmt)) await graph(token, url, { method: 'PATCH', body: JSON.stringify({ numberFormat: [[numberFormat]] }) })
  return `${sheet}!${col}${row}`
}

/** Push every unwritten punch. Quiet when there is no token: the next tick tries again. */
async function flush() {
  const queue = [...(state.pendingFromEarlier || []), ...state.events].filter(e => !e.written)
  if (!queue.length) return
  const token = await getTokenSilent()
  if (!token) return
  for (const e of queue) {
    try {
      const d = new Date(e.at)
      e.cell = await writeCell(token, d, e.col, e.value)
      e.written = true; e.error = null
    } catch (err) {
      e.error = err.message
      console.error('[timeclock]', err.message)
    }
  }
  if (state.pendingFromEarlier?.every(e => e.written)) delete state.pendingFromEarlier
  save()
}

// ── punches ───────────────────────────────────────────────────────────
const TRANSITIONS = {
  in: { from: ['off', 'out'], to: 'in', col: COL.in },
  lunchOut: { from: ['in'], to: 'lunch', col: COL.lunchOut },
  lunchIn: { from: ['lunch'], to: 'in', col: COL.lunchIn },
  out: { from: ['in', 'lunch'], to: 'out', col: COL.out }
}

function record(kind, when, { auto = false } = {}) {
  const t = TRANSITIONS[kind]
  const rounded = auto ? new Date(new Date(when).setSeconds(0, 0)) : roundFor(kind, when)
  const ev = { kind, at: rounded.toISOString(), col: t.col, value: fraction(rounded), label: hhmm(rounded), auto, written: false, error: null }
  state.events.push(ev)
  state.status = t.to
  // Break recorded as D->E: G must not count it a second time.
  if (kind === 'lunchIn') state.events.push({ kind: 'pause', at: rounded.toISOString(), col: COL.pause, value: 0, label: '0:00', auto: true, written: false, error: null })
  // Day ended mid-break: close the afternoon at the same minute so the F-E term is zero.
  if (kind === 'out' && state.events.some(e => e.kind === 'lunchOut') && !state.events.some(e => e.kind === 'lunchIn')) {
    state.events.push({ kind: 'lunchIn', at: rounded.toISOString(), col: COL.lunchIn, value: fraction(rounded), label: hhmm(rounded), auto: true, written: false, error: null })
    state.events.push({ kind: 'pause', at: rounded.toISOString(), col: COL.pause, value: 0, label: '0:00', auto: true, written: false, error: null })
  }
  save()
  return ev
}

export async function punch(kind, when = new Date()) {
  rollover()
  const t = TRANSITIONS[kind]
  if (!t) throw new Error(`unknown punch ${kind}`)
  if (!t.from.includes(state.status)) throw new Error(`cannot ${kind} while ${state.status}`)
  // D/E hold one break. A second one would overwrite the first; put that into Pause (G) by hand instead.
  if (kind === 'lunchOut' && state.events.some(e => e.kind === 'lunchOut')) throw new Error('Lunch is already recorded today. A second break goes into the Pause column by hand.')
  record(kind, when)
  await flush()
  return snapshot()
}

/** Wipe today's punches locally (the workbook keeps what was written; correct that in Excel). */
export function resetToday() {
  state = { ...fresh(), unclosed: state.unclosed }
  save()
  return snapshot()
}

// ── scheduler ─────────────────────────────────────────────────────────
async function tick() {
  rollover()
  const now = new Date()
  const lunch = at(now, LUNCH_AT()), end = at(now, LUNCH_ENDS())

  // 12:00, once a day, not on weekends, and not when the day is already over or the break has begun
  const weekday = now.getDay() >= 1 && now.getDay() <= 5
  if (weekday && !state.notified.lunch && now >= lunch && now < end && !['lunch', 'out'].includes(state.status)) {
    state.notified.lunch = true; save()
    bridge.notify?.({
      title: 'Lunch',
      body: state.status === 'in' ? 'It is twelve. Clock out for lunch and the break starts counting.' : 'It is twelve. You are not clocked in today.',
      route: '#/lunch'
    })
  }

  // one digest a morning: order dates inside 3 days, waiting-on items past a week, a cold Innovation lane
  if (weekday && now.getHours() >= 8 && now.getHours() < 12 && state.notified.digest !== state.date && digestSource) {
    state.notified.digest = state.date; save()
    try {
      const lines = digestSource()
      if (lines.length) bridge.notify?.({ title: lines.length === 1 ? 'One thing for today' : `${lines.length} things for today`, body: lines.slice(0, 3).join('\n'), route: '#/' })
    } catch (err) { console.warn('[digest]', err.message) }
  }

  // break that began before 12:30 ends at 12:30 exactly
  if (state.status === 'lunch' && now >= end) {
    const started = state.events.filter(e => e.kind === 'lunchOut').at(-1)
    if (started && new Date(started.at) < end) {
      record('lunchIn', end, { auto: true })
      bridge.notify?.({ title: 'Back', body: 'Lunch ended at 12:30. You are clocked in again.', route: '#/' })
    }
  }

  await flush()
}

/** The board hands in a function that returns the morning's warnings, so this module stays about time. */
let digestSource = null
export function setDigestSource(fn) { digestSource = fn }

let timer = null
export function startScheduler(everyMs = 20_000) {
  if (timer) return
  tick().catch(err => console.error('[timeclock]', err.message))
  timer = setInterval(() => tick().catch(err => console.error('[timeclock]', err.message)), everyMs)
}

// ── what the UI sees ──────────────────────────────────────────────────
export function snapshot() {
  rollover()
  const lunchOut = state.events.filter(e => e.kind === 'lunchOut').at(-1)
  const lunchIn = state.events.filter(e => e.kind === 'lunchIn').at(-1)
  return {
    date: state.date,
    status: state.status,
    events: state.events,
    pending: [...(state.pendingFromEarlier || []), ...state.events].filter(e => !e.written).length,
    lastError: [...state.events].reverse().find(e => e.error)?.error || null,
    unclosed: state.unclosed,
    sheet: state.sheet,
    workbook: workbookLabel(),
    lunch: {
      at: `${String(LUNCH_AT().h).padStart(2, '0')}:${String(LUNCH_AT().m).padStart(2, '0')}`,
      endsAt: `${String(LUNCH_ENDS().h).padStart(2, '0')}:${String(LUNCH_ENDS().m).padStart(2, '0')}`,
      startedAt: lunchOut?.at || null,
      endedAt: lunchIn?.at || null,
      // a break that started after 12:30 is not auto-ended
      autoEnd: lunchOut ? new Date(lunchOut.at) < at(new Date(lunchOut.at), LUNCH_ENDS()) : true
    },
    roundMinutes: ROUND_MIN()
  }
}
