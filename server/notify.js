/**
 * Notification history (roadmap 107) and the one policy every notification goes through (roadmap 150).
 * Every notification Bench sends comes here: server/notify-policy.js decides whether it is recorded and
 * whether it goes to the desktop, it is written to BENCH_USER_DIR/notifications.json (newest first, 200
 * kept) and, when the policy says so, handed to the desktop shell (`bridge.notify`), which shows the
 * Windows toast. The Bell in the nav reads the list, so a toast that was missed or held back is still there.
 *
 *   notify({ title, body, route, category, key, url })
 *     category   see notify-policy.js; without one the time clock's three are known by title, the rest is 'other'
 *     key        de-duplication: the same category and key go out once a day
 *     url        an https link the toast opens on a click (a Teams meeting), instead of the route
 *
 *   GET  /api/notifications?limit=20        { items: [{ id, at, title, body, route, read, category, snoozable }], unread }
 *   POST /api/notifications/read            { ids: [...] } or { all: true }  ->  { unread }
 *   POST /api/notifications/:id/snooze      { preset: 'hour' | 'tomorrow' }  ->  { until, unread }
 *   POST /api/notifications/focus           { until: ISO | null }  the focus timer runs until then
 *   POST /api/notifications/send            { title, body, route, category: 'focus' }  from the window
 *   POST /api/notifications/test            one test notification, through the quiet hours
 *   GET  /api/notifications/categories      the categories with their labels, defaults and the modes in force
 *
 * Context the policy needs and cannot read itself: today's meetings (day.js hands them over whenever it
 * reads the calendar) and a running focus session (the window says so). A snoozed row is stored here and
 * sent again through notify() when its time comes (`fireSnoozed`, on the alerts timer).
 * Nothing here throws at a caller: the modules that notify run on timers and must not die over a full disk.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { bridge } from './bridge.js'
import * as settings from './settings.js'
import { CATEGORIES, SNOOZABLE, decide, holdReason, inferCategory, modeOf, snoozeUntil } from './notify-policy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(
  process.env.BENCH_USER_DIR || process.env.BENCH_SECRETS_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data'),
  'notifications.json'
)
/** How many are kept. Older ones fall off the end. */
export const CAP = 200
const KEYS_A_DAY = 500
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

let memo = null
function load() {
  if (memo) return memo
  try { memo = JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { memo = { items: [] } }
  if (!memo || typeof memo !== 'object') memo = { items: [] }
  if (!Array.isArray(memo.items)) memo.items = []
  if (!Array.isArray(memo.snoozes)) memo.snoozes = []
  if (!memo.day || typeof memo.day !== 'object') memo.day = { date: null, keys: [], counts: {} }
  return memo
}
function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(memo, null, 2)); fs.renameSync(FILE + '.tmp', FILE)
  } catch (err) { console.warn('[notify] not saved:', err.message) }
}
/** The day's de-duplication keys and toast counts start over at midnight. */
function today(m, now) {
  const date = dayKey(now)
  if (m.day.date !== date) m.day = { date, keys: [], counts: {} }
  if (!Array.isArray(m.day.keys)) m.day.keys = []
  if (!m.day.counts || typeof m.day.counts !== 'object') m.day.counts = {}
  return m.day
}

// ── what the policy needs to know ─────────────────────────────────────
const ctx = { meetings: [], meetingsDate: null, focusUntil: null }
/** Today's meetings as day.js read them from the calendar. */
export function setMeetings(events, now = new Date()) { ctx.meetings = Array.isArray(events) ? events : []; ctx.meetingsDate = dayKey(now) }
/** A focus session runs until this moment; null when it stopped or paused. */
export function setFocus(until) {
  const t = until ? new Date(until) : null
  ctx.focusUntil = t && !Number.isNaN(t.getTime()) ? t.toISOString() : null
  return ctx.focusUntil
}
const meetingsFor = now => ctx.meetingsDate === dayKey(now) ? ctx.meetings : []
/** 'quiet', 'meeting', 'focus' or null: why a toast of this category would be held right now. */
export const holdFor = (category, now = new Date()) => holdReason({ category, now, settings: settings.get(), meetings: meetingsFor(now), focusUntil: ctx.focusUntil })
/** The mode in force for a category: desktop, bell or off. */
export const modeFor = (category) => modeOf(category, settings.get())

/**
 * Record it and, when the policy says so, show it. Returns the stored item, or null when the category is
 * off or the key already went out today. `now` is for the tests; `force` (the test button) skips the policy
 * and asks the desktop to get through the quiet hours as well.
 */
export function notify(payload = {}, { now = new Date(), force = false } = {}) {
  const m = load()
  const category = inferCategory(payload)
  const key = payload.key === undefined || payload.key === null ? null : String(payload.key)
  const day = today(m, now)
  let d
  try {
    d = force ? { record: true, desktop: true, reason: null } : decide({ category, key, now, settings: settings.get(), day, meetings: meetingsFor(now), focusUntil: ctx.focusUntil })
  } catch (err) { console.warn('[notify] policy:', err.message); d = { record: true, desktop: false, reason: 'error' } }
  if (!d.record) return null
  const url = typeof payload.url === 'string' && /^https:\/\//i.test(payload.url) ? payload.url : null
  const item = {
    id: crypto.randomUUID(),
    at: now.toISOString(),
    title: String(payload.title || '').trim() || 'Bench.',
    body: String(payload.body || ''),
    route: typeof payload.route === 'string' && payload.route ? payload.route : null,
    read: false,
    category,
    snoozable: SNOOZABLE.has(category),
    desktop: d.desktop,
    ...(d.reason ? { held: d.reason } : {}),
    ...(url ? { url } : {})
  }
  if (key !== null) { day.keys.push(`${category}:${key}`); if (day.keys.length > KEYS_A_DAY) day.keys.splice(0, day.keys.length - KEYS_A_DAY) }
  if (d.desktop) day.counts[category] = (day.counts[category] || 0) + 1
  m.items.unshift(item)
  if (m.items.length > CAP) m.items.length = CAP
  save()
  if (d.desktop) {
    const out = { title: item.title, body: item.body, route: item.route }
    if (url) out.url = url
    if (force) out.force = true
    try { bridge.notify?.(out) } catch (err) { console.warn('[notify] desktop refused it:', err.message) }
  }
  return item
}

/** The last `limit`, newest first. */
export function list(limit = 20) {
  const n = Math.max(1, Math.min(CAP, Number(limit) || 20))
  return load().items.slice(0, n)
}
/** How many have not been read. */
export const unread = () => load().items.filter(i => !i.read).length

/** Mark some ids read, or 'all'. Returns the unread count that is left. */
export function markRead(ids) {
  const m = load()
  const all = ids === 'all'
  const set = new Set(Array.isArray(ids) ? ids.map(String) : [])
  let changed = 0
  for (const i of m.items) if (!i.read && (all || set.has(i.id))) { i.read = true; changed++ }
  if (changed) save()
  return unread()
}

// ── snooze ────────────────────────────────────────────────────────────
/**
 * Put a row away until later: 'hour' or 'tomorrow' (08:30). The row counts as read; at that time the same
 * title and body go out again through notify(), with the policy of the moment. Returns { until } or null
 * when there is no such row, or it is of a kind that cannot be snoozed.
 */
export function snooze(id, preset, now = new Date()) {
  const m = load()
  const item = m.items.find(i => i.id === String(id))
  const until = snoozeUntil(preset, now)
  if (!item || !until || !SNOOZABLE.has(item.category)) return null
  item.read = true
  item.snoozedUntil = until.toISOString()
  m.snoozes = m.snoozes.filter(s => s.of !== item.id)
  m.snoozes.push({ of: item.id, until: until.toISOString(), title: item.title, body: item.body, route: item.route, category: item.category, ...(item.url ? { url: item.url } : {}) })
  save()
  return { until: until.toISOString() }
}
/** Snoozes whose time has come go out again. A reminder that would be held by a meeting or focus waits. */
export function fireSnoozed(now = new Date()) {
  const m = load()
  const due = m.snoozes.filter(s => new Date(s.until) <= now)
  if (!due.length) return []
  const sent = []
  for (const s of due) {
    const held = holdFor(s.category, now)
    if (held === 'meeting' || held === 'focus') continue
    m.snoozes = m.snoozes.filter(x => x !== s)
    const item = notify({ title: s.title, body: s.body, route: s.route, category: s.category, url: s.url }, { now })
    if (item) sent.push(item)
  }
  save()
  return sent
}
export const snoozed = () => load().snoozes.slice()

/** The Settings button: one notification that gets through quiet hours, so you can see what they look like. */
export const sendTest = (now = new Date()) => notify({ title: 'Test.', body: 'This is how a Bench. notification looks.', route: '#/', category: 'other' }, { now, force: true })

/** For the tests: forget everything in memory and on disk. */
export function _reset() { memo = { items: [], snoozes: [], day: { date: null, keys: [], counts: {} } }; ctx.meetings = []; ctx.meetingsDate = null; ctx.focusUntil = null; save() }

export function registerRoutes(app) {
  app.get('/api/notifications', wrap((req, res) => res.json({ items: list(req.query.limit), unread: unread() })))
  app.post('/api/notifications/read', wrap((req, res) => {
    const b = req.body || {}
    res.json({ unread: markRead(b.all === true ? 'all' : (Array.isArray(b.ids) ? b.ids : [])) })
  }))
  app.get('/api/notifications/categories', wrap((_req, res) => {
    const s = settings.get()
    res.json({ categories: CATEGORIES.map(({ key, label, hint, mode, cap }) => ({ key, label, hint, default: mode, cap, mode: modeOf(key, s) })) })
  }))
  app.post('/api/notifications/test', wrap((_req, res) => res.json({ item: sendTest() })))
  app.post('/api/notifications/focus', wrap((req, res) => res.json({ focusUntil: setFocus(req.body?.until || null) })))
  app.post('/api/notifications/send', wrap((req, res) => {
    const b = req.body || {}
    if (b.category !== 'focus') return res.status(400).json({ error: 'Only the focus timer sends from the window.' })
    res.json({ item: notify({ title: String(b.title || '').slice(0, 120), body: String(b.body || '').slice(0, 300), route: typeof b.route === 'string' ? b.route : '#/board', category: 'focus' }) })
  }))
  app.post('/api/notifications/:id/snooze', wrap((req, res) => {
    const r = snooze(req.params.id, req.body?.preset)
    if (!r) return res.status(400).json({ error: 'That one cannot be snoozed.' })
    res.json({ ...r, unread: unread() })
  }))
}
