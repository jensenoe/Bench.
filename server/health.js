/**
 * Health (roadmap 78). One answer to "is everything plugged in": the data folder, the shared files, the
 * Microsoft 365 sign-in, the hours workbook, the source tools, the backups and their OneDrive mirror.
 * Cached for a minute, refreshed every ten in the background; ?force=1 runs it now. /api/diagnostics is
 * the same and more as plain text, for pasting into a message. No secrets in either.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as auth from './auth.js'
import * as store from './store.js'
import * as notes from './notes.js'
import * as timeclock from './timeclock.js'
import * as backup from './backup.js'
import * as settings from './settings.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data')
const USER_DIR = process.env.BENCH_USER_DIR || process.env.BENCH_SECRETS_DIR || DATA_DIR
export const CACHE_MS = 60_000
export const REFRESH_MS = 10 * 60_000
const PROBE_MS = 60 * 60_000
const DAY = 86400000

let last = null            // { at, result }
let probe = null           // { at, result } of timeclock.probe(), at most hourly
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function checkDataDir() {
  const file = path.join(DATA_DIR, `.bench-probe-${process.pid}`)
  try {
    if (!fs.statSync(DATA_DIR).isDirectory()) return { key: 'data', label: 'Data folder', ok: false, detail: `${DATA_DIR} is not a folder.` }
    fs.writeFileSync(file, String(Date.now()))
    fs.rmSync(file, { force: true })
    return { key: 'data', label: 'Data folder', ok: true, detail: DATA_DIR }
  } catch (err) {
    return { key: 'data', label: 'Data folder', ok: false, detail: `${DATA_DIR}: ${err.code || err.message}` }
  }
}
function checkStore() {
  const s = store.status(), n = notes.status()
  if (!s.offline && !n.offline) return { key: 'store', label: 'Shared files', ok: true, detail: 'In sync with the folder.' }
  const o = s.offline ? s : n
  return { key: 'store', label: 'Shared files', ok: false, detail: `Unreachable since ${o.since?.slice(11, 16) || '?'}, ${s.pending + n.pending} write(s) held in memory. ${o.error || ''}`.trim() }
}
async function checkM365() {
  if (!auth.isConfigured()) return { key: 'm365', label: 'Microsoft 365', ok: true, detail: 'Not configured; local only.' }
  const account = await auth.getAccount().catch(() => null)
  const token = await auth.getTokenSilent('core').catch(() => null)
  if (token) return { key: 'm365', label: 'Microsoft 365', ok: true, detail: account?.username || 'connected' }
  return { key: 'm365', label: 'Microsoft 365', ok: false, detail: account ? 'The sign-in has expired. Reconnect in Settings.' : 'Not connected.' }
}
async function checkWorkbook(m365ok) {
  if (!auth.isConfigured()) return { key: 'workbook', label: 'Hours workbook', ok: true, detail: 'Needs Microsoft 365.' }
  if (!m365ok) return { key: 'workbook', label: 'Hours workbook', ok: false, detail: 'Waiting for Microsoft 365.' }
  if (!probe || Date.now() - probe.at > PROBE_MS) probe = { at: Date.now(), result: await timeclock.probe().catch(err => ({ ok: false, message: err.message })) }
  const r = probe.result
  return { key: 'workbook', label: 'Hours workbook', ok: Boolean(r.ok), detail: r.ok ? `${r.sheet}, row ${r.row} in ${r.workbook}` : (r.message || 'Could not read the workbook.') }
}
function checkSources() {
  const src = store.getMeta().sources || {}
  const bad = Object.entries(src).filter(([, v]) => v?.error)
  if (!bad.length) return { key: 'sources', label: 'Sources', ok: true, detail: Object.keys(src).length ? `${Object.keys(src).length} source(s), no errors.` : 'No source has synced yet.' }
  return { key: 'sources', label: 'Sources', ok: false, detail: bad.map(([k, v]) => `${k}: ${String(v.error).slice(0, 120)}`).join(' ') }
}
function checkBackups() {
  const files = backup.list().filter(b => !b.beforeRestore)
  const today = new Date(), yesterday = new Date(Date.now() - DAY)
  const fresh = files.find(b => b.date === ymd(today) || b.date === ymd(yesterday))
  if (fresh) return { key: 'backups', label: 'Backups', ok: true, detail: `Last copy ${fresh.date}, ${files.length} on file.` }
  // nothing changed for two days is not a fault: the newest copy is as new as the data
  const newestData = Math.max(0, ...backup.NAMES.map(n => { try { return fs.statSync(path.join(DATA_DIR, `${n}.json`)).mtimeMs } catch { return 0 } }))
  const newest = files[0]
  if (newest && new Date(newest.at).getTime() >= newestData - 60_000) return { key: 'backups', label: 'Backups', ok: true, detail: `Nothing changed since the last copy on ${newest.date}.` }
  return { key: 'backups', label: 'Backups', ok: false, detail: newest ? `Newest copy is from ${newest.date}.` : 'No backup yet. One is written on the first save of a day.' }
}
function checkMirror(m365ok) {
  const m = backup.mirrorStatus()
  if (!auth.isConfigured() || !m365ok) return { key: 'mirror', label: 'Backup mirror', ok: true, detail: 'Needs Microsoft 365; the local copies stand.' }
  if (m.ok === null) return { key: 'mirror', label: 'Backup mirror', ok: true, detail: 'Not run yet; it goes to OneDrive once a day.' }
  return { key: 'mirror', label: 'Backup mirror', ok: Boolean(m.ok), detail: m.ok ? `${m.files.length} file(s) to OneDrive on ${m.date}.` : (m.error || 'The last mirror failed.') }
}

/** { ok, at, checks: [{ key, label, ok, detail }] }. Cached for a minute unless forced. */
export async function check({ force = false } = {}) {
  if (!force && last && Date.now() - last.at < CACHE_MS) return last.result
  const checks = [checkDataDir(), checkStore()]
  const m365 = await checkM365()
  checks.push(m365, await checkWorkbook(m365.ok), checkSources(), checkBackups(), checkMirror(m365.ok))
  const result = { ok: checks.every(c => c.ok), at: new Date().toISOString(), checks }
  last = { at: Date.now(), result }
  return result
}

/** Settings as they may be shown: the GitHub token never, a sharing link only as "set". */
function safeSettings() {
  const { updateToken, _pathSetByUser, timesheetUrl, ...rest } = settings.get()
  return { ...rest, timesheetUrl: timesheetUrl ? '(set)' : '', updateToken: updateToken ? '(set)' : '' }
}
function version() { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version } catch { return 'unknown' } }
function logTail(n = 60) {
  const f = process.env.BENCH_LOG_FILE
  if (!f) return null
  try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).slice(-n).join('\n') } catch (err) { return `(log not readable: ${err.code || err.message})` }
}

/** Plain text for a message to whoever helps: what is where, what works, what the log said last. */
export async function diagnostics() {
  const h = await check({ force: true })
  const src = store.getMeta().sources || {}
  const lines = [
    `Bench ${version()}`,
    `Node ${process.version}, ${process.platform} ${os.release()} ${process.arch}`,
    `At ${new Date().toISOString()}`,
    '',
    'Paths.',
    `  data   ${DATA_DIR}`,
    `  user   ${USER_DIR}`,
    `  log    ${process.env.BENCH_LOG_FILE || '(not set)'}`,
    '',
    'Settings.',
    ...Object.entries(safeSettings()).map(([k, v]) => `  ${k.padEnd(16)} ${JSON.stringify(v)}`),
    '',
    'Sources.',
    ...(Object.keys(src).length ? Object.entries(src).map(([k, v]) => `  ${k.padEnd(10)} ${v.error ? 'error: ' + v.error : 'ok'}, last ${v.lastSync || v.lastAttempt || 'never'}, ${v.count ?? 0} item(s)`) : ['  none yet']),
    '',
    'Store.',
    `  tasks    ${store.allTasks().length} (${store.allTasks().filter(t => !t.done).length} open)`,
    `  status   ${JSON.stringify(store.status())}`,
    `  notes    ${JSON.stringify(notes.status())}`,
    '',
    `Health: ${h.ok ? 'ok' : 'attention'} at ${h.at}.`,
    ...h.checks.map(c => `  ${c.ok ? 'ok  ' : 'FAIL'} ${c.label.padEnd(16)} ${c.detail}`),
    ''
  ]
  const tail = logTail()
  if (tail !== null) lines.push('Log, last 60 lines.', tail, '')
  return lines.join('\n')
}

let timer = null
export function start() {
  if (timer) return
  timer = setInterval(() => check({ force: true }).catch(err => console.warn('[health]', err.message)), REFRESH_MS)
  timer.unref?.()
}
export function stop() { if (timer) clearInterval(timer); timer = null }

/** Express routes; `wrap` is the server's promise-to-response helper. */
export function registerRoutes(app, wrap) {
  app.get('/api/health', wrap(async (req, res) => res.json(await check({ force: req.query.force === '1' }))))
  app.get('/api/diagnostics', wrap(async (_req, res) => { res.type('text/plain; charset=utf-8').send(await diagnostics()) }))
}
