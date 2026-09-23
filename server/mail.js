/**
 * Procurement that reads the mail (roadmap 113). Every 30 minutes, when Settings says so and the
 * Microsoft sign-in carries Mail.Read, the last seven days of the inbox are read through Graph (subject,
 * date, sender, preview; never an attachment) and matched against the open tasks that carry a supplier
 * and a PO number. A message that names the PO and reads like an order confirmation sets ordered-on; one
 * that reads like a delivery note sets delivered-on. Each message is used once (mail.json in the user
 * folder remembers it) and each change is one desktop notification.
 *
 *   GET  /api/mail/status   { on, lastRun, matched, reason }
 *   POST /api/mail/run      read now
 *   GET  /api/suppliers     one row per supplier: counts, median lead time, hit rate, the open POs
 *
 * `classify` and `suppliersFrom` are pure and tested with fixtures.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as store from './store.js'
import * as settings from './settings.js'
import { getTokenSilent, getAccount } from './auth.js'
import { bridge } from './bridge.js'
import { stats } from './leadtimes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATE_FILE = path.join(process.env.BENCH_USER_DIR || process.env.BENCH_SECRETS_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data'), 'mail.json')
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))

export const EVERY_MS = 30 * 60_000
export const DAYS_BACK = 7
export const CONFIRM = /auftragsbest|order confirm|confirmation|\bAB\b/i
export const DELIVERY = /lieferschein|delivery|versand|shipped|geliefert|delivered|tracking/i

// ── state ─────────────────────────────────────────────────────────────
const fresh = () => ({ lastRun: null, matched: 0, reason: null, used: {} })
let state = null
function load() { if (state) return state; try { state = { ...fresh(), ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } } catch { state = fresh() } return state }
function save() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  fs.writeFileSync(STATE_FILE + '.tmp', JSON.stringify(state, null, 2)); fs.renameSync(STATE_FILE + '.tmp', STATE_FILE)
}
/** For the tests. */
export function _reset() { state = fresh(); save() }

// ── pure parts ────────────────────────────────────────────────────────
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const dayOf = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
/** The PO number as a word: "4711" must not match inside "47110". */
const poRe = po => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(String(po).trim())}(?![\\p{L}\\p{N}])`, 'iu')

/**
 * Which tasks one message settles. `message` is { id, subject, bodyPreview, receivedDateTime, from };
 * `tasks` are the board's tasks. Returns [{ taskId, field, value, poNumber, supplier, title, messageId, subject }]
 * with field 'orderedOn' or 'deliveredOn' and value the message's day. A task that already has the field is
 * left alone; a message that names the PO but reads like neither is ignored.
 */
export function classify(message, tasks) {
  const text = `${message?.subject || ''}\n${message?.bodyPreview || ''}`
  const day = dayOf(message?.receivedDateTime)
  if (!day || !text.trim()) return []
  const out = []
  for (const t of tasks) {
    if (t.done || !t.supplier || !t.poNumber) continue
    if (!poRe(t.poNumber).test(text)) continue
    const base = { taskId: t.id, title: t.title, poNumber: t.poNumber, supplier: t.supplier, messageId: message.id || null, subject: message.subject || '', value: day }
    if (!t.orderedOn && CONFIRM.test(text)) out.push({ ...base, field: 'orderedOn' })
    if (!t.deliveredOn && DELIVERY.test(text)) out.push({ ...base, field: 'deliveredOn' })
  }
  return out
}

/** "Bosch confirmed PO 4711." or "Bosch delivered PO 4711." with the route to the Procurement page. */
export const changeMessage = (c) => ({
  title: c.field === 'orderedOn' ? 'Order confirmed.' : 'Delivered.',
  body: `${c.supplier} ${c.field === 'orderedOn' ? 'confirmed' : 'delivered'} PO ${c.poNumber}.`,
  route: '#/procurement'
})

const key = s => String(s || '').trim().toLowerCase()
/**
 * One row per supplier from the tasks and the learned lead times:
 *   open       parts not yet ordered (open task with a supplier, no orderedOn)
 *   ordered    ordered, not yet delivered
 *   delivered  parts with a delivered-on date
 *   medianDays the supplier's median lead time from leadtimes.stats, null when unknown
 *   hitRate    share of deliveries that landed on or before the need-by date, null without dated deliveries
 *   openPOs    the ordered, undelivered parts: { id, title, poNumber, orderedOn, dueDate }
 */
export function suppliersFrom(tasks = [], leadStats = []) {
  const by = new Map()
  const medians = new Map(leadStats.map(s => [s.key, s.median]))
  for (const t of tasks) {
    const supplier = t.supplier || t.meta?.supplier
    if (!supplier) continue
    const k = key(supplier)
    if (!by.has(k)) by.set(k, { supplier: String(supplier).trim(), open: 0, ordered: 0, delivered: 0, medianDays: medians.get(k) ?? null, hits: 0, dated: 0, openPOs: [] })
    const s = by.get(k)
    const orderedOn = t.orderedOn || t.meta?.orderedOn || null
    const deliveredOn = t.deliveredOn || t.meta?.deliveredOn || null
    const needBy = t.dueDate || t.meta?.needBy || null
    if (deliveredOn) {
      s.delivered++
      if (needBy) { s.dated++; if (deliveredOn.slice(0, 10) <= needBy.slice(0, 10)) s.hits++ }
    } else if (orderedOn) {
      s.ordered++
      if (!t.done) s.openPOs.push({ id: t.id, title: t.title, poNumber: t.poNumber || t.meta?.orderNumber || null, orderedOn: orderedOn.slice(0, 10), dueDate: needBy ? needBy.slice(0, 10) : null })
    } else if (!t.done) s.open++
  }
  return [...by.values()].map(({ hits, dated, ...s }) => ({
    ...s, hitRate: dated ? Math.round((hits / dated) * 100) / 100 : null,
    openPOs: s.openPOs.sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9') || a.orderedOn.localeCompare(b.orderedOn))
  })).sort((a, b) => (b.open + b.ordered) - (a.open + a.ordered) || a.supplier.localeCompare(b.supplier))
}

// ── Graph ─────────────────────────────────────────────────────────────
async function readMessages(token, { fetchImpl = fetch, now = new Date() } = {}) {
  const since = new Date(now.getTime() - DAYS_BACK * 86400000).toISOString()
  const url = `https://graph.microsoft.com/v1.0/me/messages?$top=50&$select=subject,receivedDateTime,from,bodyPreview&$orderby=receivedDateTime desc&$filter=receivedDateTime ge ${since}`
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Graph ${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`)
  const { value = [] } = await res.json()
  return value
}

/** Apply what `classify` found: one store write per change, one notification, remembered so it never repeats. */
export function applyChanges(changes, { notify = bridge.notify } = {}) {
  const s = load()
  const applied = []
  for (const c of changes) {
    const useKey = `${c.messageId || c.subject}:${c.field}:${c.taskId}`
    if (s.used[useKey]) continue
    const t = store.updateTask(c.taskId, { [c.field]: c.value })
    if (!t) continue
    s.used[useKey] = c.value
    applied.push(c)
    try { notify?.(changeMessage(c)) } catch { /* the desktop is not there */ }
  }
  // Keep the memory to the window that matters, so the file does not grow for years.
  const cutoff = dayOf(new Date(Date.now() - 60 * 86400000))
  for (const [k, v] of Object.entries(s.used)) if (v < cutoff) delete s.used[k]
  if (applied.length) s.matched += applied.length
  save()
  return applied
}

/** One pass: read, classify against the open tasks, apply. Quiet about its reasons; `status()` tells them. */
export async function run({ fetchImpl = fetch, now = new Date() } = {}) {
  const s = load()
  s.lastRun = now.toISOString()
  if (!settings.get().mailRead) { s.reason = 'off'; save(); return { ok: false, reason: 'off', applied: [] } }
  const token = await getTokenSilent('extra')
  if (!token) { s.reason = (await getAccount()) ? 'needs-admin-consent' : 'needs-signin'; save(); return { ok: false, reason: s.reason, applied: [] } }
  try {
    const messages = await readMessages(token, { fetchImpl, now })
    const tasks = store.allTasks()
    // Oldest first, so an order confirmation and a delivery note in the same week land in that order.
    const changes = messages.slice().reverse().flatMap(m => classify(m, tasks))
    const applied = applyChanges(changes)
    s.reason = null; s.lastRun = now.toISOString(); save()
    return { ok: true, read: messages.length, applied }
  } catch (err) {
    s.reason = err.message.slice(0, 200); save()
    return { ok: false, reason: s.reason, applied: [] }
  }
}

export function status() {
  const s = load()
  return { on: Boolean(settings.get().mailRead), lastRun: s.lastRun, matched: s.matched, reason: s.reason }
}

let timer = null
export function start(everyMs = EVERY_MS) {
  if (timer) return
  const tick = () => { if (settings.get().mailRead) run().catch(err => console.warn('[mail]', err.message)) }
  setTimeout(tick, 45_000).unref?.()
  timer = setInterval(tick, everyMs)
  timer.unref?.()
}
export function stop() { if (timer) clearInterval(timer); timer = null }

export function registerRoutes(app) {
  app.get('/api/mail/status', wrap((_req, res) => res.json(status())))
  app.post('/api/mail/run', wrap(async (_req, res) => res.json({ ...(await run()), ...status() })))
  app.get('/api/suppliers', wrap((_req, res) => res.json(suppliersFrom(store.allTasks(), stats()))))
}
