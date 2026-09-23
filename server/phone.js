/**
 * The phone view on the workshop network (roadmap 116). A second, small Express app on port 5199 bound to
 * every interface, behind a PIN, serving one mobile page: the brief in short, Today with tick buttons, the
 * punches that are valid now, a quick add, and a camera input that drops a photo into the inbox folder.
 * It holds no data of its own: every read and write goes to the main Bench on 127.0.0.1.
 *
 * Every request needs the PIN, as a `bench-pin` header or as the `pin` cookie that POST /pin sets (the cookie
 * carries a hash of the PIN, never the PIN). The only ungated answers are the PIN form itself and POST /pin.
 * Ten wrong PINs inside a minute lock that address for five minutes.
 *
 * `start()` polls Settings every 30 seconds: phoneAccess on and a PIN set brings the server up, either off
 * takes it down. GET /api/phone on the main app says where it is (the URL is printed as text: a QR code
 * would need a library, and the address is short enough to type).
 */
import http from 'node:http'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import express from 'express'
import * as settings from './settings.js'
import { readPort } from './mcp.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const USER_DIR = process.env.BENCH_USER_DIR || process.env.BENCH_SECRETS_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data')
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))

export const PORT = 5199
export const MAX_WRONG = 10
export const WINDOW_MS = 60_000
export const LOCK_MS = 5 * 60_000
export const POLL_MS = 30_000
const COOKIE_AGE_S = 12 * 3600
const SECRET = crypto.randomBytes(16).toString('hex')   // per process: a restart signs everyone out, which is fine on a LAN

// ── pure parts ────────────────────────────────────────────────────────
const TRANSITIONS = { in: ['off', 'out'], lunchOut: ['in'], lunchIn: ['lunch'], out: ['in', 'lunch'] }
export const PUNCH_LABEL = { in: 'Clock in', lunchOut: 'Lunch', lunchIn: 'Back', out: 'Clock out' }
/** The punches the time clock accepts from a status. */
export const validPunches = (status) => Object.entries(TRANSITIONS).filter(([, from]) => from.includes(status || 'off')).map(([k]) => k)
export const validPin = (pin) => /^\d{4,8}$/.test(String(pin || ''))
const tokenFor = (pin) => crypto.createHmac('sha256', SECRET).update(String(pin)).digest('hex')
const parseCookies = (header) => Object.fromEntries(String(header || '').split(';').map(s => s.trim()).filter(Boolean).map(s => { const i = s.indexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i), decodeURIComponent(s.slice(i + 1))] }))
/** IPv4 addresses of this machine that a phone on the same network can reach. */
export const lanAddresses = () => Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address)

/**
 * Wrong-PIN memory per address: `wrong(ip)` records one, `locked(ip)` says whether the address is out for now.
 * Ten inside the window lock for five minutes; a right PIN clears the slate. `clock` is injectable for the tests.
 */
export function limiter({ max = MAX_WRONG, windowMs = WINDOW_MS, lockMs = LOCK_MS, clock = Date.now } = {}) {
  const by = new Map()
  const entry = ip => { if (!by.has(ip)) by.set(ip, { wrong: [], lockedUntil: 0 }); return by.get(ip) }
  return {
    locked(ip) { const e = entry(ip); return e.lockedUntil > clock() ? e.lockedUntil - clock() : 0 },
    wrong(ip) {
      const e = entry(ip), now = clock()
      e.wrong = e.wrong.filter(t => now - t < windowMs); e.wrong.push(now)
      if (e.wrong.length >= max) { e.lockedUntil = now + lockMs; e.wrong = [] }
      return e.lockedUntil > now
    },
    right(ip) { by.delete(ip) },
    size() { return by.size }
  }
}

// ── the app ───────────────────────────────────────────────────────────
const mainBaseDefault = () => `http://127.0.0.1:${readPort()}`
const inboxDefault = () => String(settings.get().inboxDir || '').trim() || path.join(USER_DIR, 'inbox')

/**
 * The LAN app. `pin` is fixed for the app's life (a changed PIN restarts it), `mainBase` and `inboxDir` may be
 * functions so they follow the port file and Settings. `clock` reaches the limiter for the tests.
 */
export function createApp({ pin, mainBase = mainBaseDefault, inboxDir = inboxDefault, clock = Date.now, fetchImpl = fetch } = {}) {
  if (!validPin(pin)) throw new Error('The phone view needs a PIN of four to eight digits.')
  const base = () => typeof mainBase === 'function' ? mainBase() : mainBase
  const inbox = () => typeof inboxDir === 'function' ? inboxDir() : inboxDir
  const token = tokenFor(pin)
  const limit = limiter({ clock })
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', false)
  const ip = req => req.socket?.remoteAddress || req.ip || 'unknown'

  const authed = req => req.headers['bench-pin'] === String(pin) || parseCookies(req.headers.cookie).pin === token
  const gate = (req, res, next) => {
    const left = limit.locked(ip(req))
    if (left) return res.status(429).json({ error: 'Too many wrong PINs. Wait five minutes.', retryAfter: Math.ceil(left / 1000) })
    if (authed(req)) { limit.right(ip(req)); return next() }
    if (req.headers['bench-pin'] !== undefined) limit.wrong(ip(req))
    res.status(401).json({ error: 'PIN needed.' })
  }

  // The page: the PIN form for a stranger, the app for a known phone. Both are the same HTML file in spirit.
  app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (limit.locked(ip(req))) return res.status(429).type('html').send(page({ locked: true }))
    res.type('html').send(page({ authed: authed(req) }))
  })
  app.post('/pin', express.json({ limit: '2kb' }), (req, res) => {
    const left = limit.locked(ip(req))
    if (left) return res.status(429).json({ error: 'Too many wrong PINs. Wait five minutes.', retryAfter: Math.ceil(left / 1000) })
    if (String(req.body?.pin || '') !== String(pin)) { const locked = limit.wrong(ip(req)); return res.status(locked ? 429 : 401).json({ error: locked ? 'Too many wrong PINs. Wait five minutes.' : 'Wrong PIN.' }) }
    limit.right(ip(req))
    res.setHeader('Set-Cookie', `pin=${token}; Path=/; Max-Age=${COOKIE_AGE_S}; HttpOnly; SameSite=Strict`)
    res.json({ ok: true })
  })

  const main = async (method, url, body) => {
    const r = await fetchImpl(base() + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let json = null; try { json = text ? JSON.parse(text) : null } catch { /* not json */ }
    if (!r.ok) throw Object.assign(new Error(json?.error || `Bench answered ${r.status}.`), { status: r.status })
    return json
  }

  app.use('/api', gate)
  app.get('/api/ping', (_req, res) => res.json({ ok: true, at: new Date().toISOString() }))
  /** Everything the page shows, in one call. */
  app.get('/api/brief', wrap(async (_req, res) => {
    const [state, brief, clockSnap] = await Promise.all([main('GET', '/api/state'), main('GET', '/api/day/brief').catch(() => null), main('GET', '/api/timeclock').catch(() => null)])
    const today = state.tasks.filter(t => t.lane === 'today' && !t.done).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(t => ({ id: t.id, title: t.title, project: t.project || null, effortHours: t.effortHours ?? null, dueDate: t.dueDate || null }))
    const worked = clockSnap ? summarizeWorked(clockSnap.events || []) : 0
    res.json({
      date: brief?.date || null, name: state.settings?.firstName || '',
      today, count: today.length, due: (brief?.due || []).length, orders: (brief?.orders || []).length,
      meetings: (brief?.meetings || []).filter(m => !m.allDay).map(m => ({ subject: m.subject, start: m.start, end: m.end })),
      clock: { status: clockSnap?.status || 'off', valid: validPunches(clockSnap?.status), worked, pending: clockSnap?.pending || 0 }
    })
  }))
  app.post('/api/tick', express.json({ limit: '4kb' }), wrap(async (req, res) => {
    if (!req.body?.id) return res.status(400).json({ error: 'Which task?' })
    res.json(await main('PATCH', `/api/tasks/${encodeURIComponent(req.body.id)}`, { done: true }))
  }))
  app.post('/api/punch', express.json({ limit: '4kb' }), wrap(async (req, res) => {
    if (!TRANSITIONS[req.body?.kind]) return res.status(400).json({ error: 'Unknown punch.' })
    res.json(await main('POST', '/api/timeclock/punch', { kind: req.body.kind }))
  }))
  /** Quick add lands on Today; when Today is full it goes to Active and the answer says so. */
  app.post('/api/add', express.json({ limit: '8kb' }), wrap(async (req, res) => {
    const title = String(req.body?.title || '').trim()
    if (!title) return res.status(400).json({ error: 'A title is needed.' })
    try { res.json({ task: await main('POST', '/api/tasks', { title, lane: 'today' }), lane: 'today' }) }
    catch (err) {
      if (err.status !== 409) throw err
      res.json({ task: await main('POST', '/api/tasks', { title, lane: 'active' }), lane: 'active', note: 'Today is full, so it went to Active.' })
    }
  }))
  /** The camera: raw image bytes in, a file in the inbox folder out. */
  app.post('/photo', gate, express.raw({ type: ['image/*', 'application/octet-stream'], limit: '25mb' }), wrap((req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'No picture arrived.' })
    const dir = inbox()
    fs.mkdirSync(dir, { recursive: true })
    const ext = /png/i.test(req.headers['content-type'] || '') ? '.png' : /webp/i.test(req.headers['content-type'] || '') ? '.webp' : /heic/i.test(req.headers['content-type'] || '') ? '.heic' : '.jpg'
    const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
    const name = `phone-${stamp}${ext}`
    fs.writeFileSync(path.join(dir, name), req.body)
    res.json({ ok: true, name, dir, size: req.body.length })
  }))
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }))
  return app
}

/** Worked ms today from the punches, the same arithmetic as the time clock. */
function summarizeWorked(events) {
  const t = k => events.filter(e => e.kind === k).at(-1)?.at
  const ms = iso => new Date(iso).getTime()
  const start = t('in'); if (!start) return 0
  const lunchOut = t('lunchOut'), lunchIn = t('lunchIn'), out = t('out')
  const end = out ? ms(out) : Date.now()
  let worked = 0
  if (lunchOut) { worked += ms(lunchOut) - ms(start); if (lunchIn) worked += end - ms(lunchIn) }
  else worked += end - ms(start)
  return Math.max(0, worked)
}

// ── the page ──────────────────────────────────────────────────────────
/**
 * One HTML string, inline CSS and JS, no build step. The house colours appear here as literal values
 * because this page is not part of the Vite app; each such line is marked tokens-ok for the lint.
 */
function page({ authed = false, locked = false } = {}) {
  const css = `
    :root { --bg: #15161C; --panel: #1E1F27; --row: #25262F; --ink: #F3F3F1; --ink-2: rgba(243,243,241,.72); --ink-3: rgba(243,243,241,.62); --line: rgba(243,243,241,.08); --line-2: rgba(243,243,241,.14); } /* tokens-ok */
    :root { --accent: #9DB9E6; --accent-ink: #0A1C2E; --ok: #8CD3A2; --late: #F0776B; --caution: #E8B85A; --held: #7CC8DA; } /* tokens-ok */
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; padding: 16px 16px 48px; }
    h1 { font-size: 30px; margin: 8px 0 4px; letter-spacing: -0.02em; }
    h2 { font-size: 20px; margin: 0 0 8px; }
    .meta { color: var(--ink-3); font-size: 14px; margin: 0 0 16px; }
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 20px; padding: 16px; margin-bottom: 12px; }
    .row { display: flex; align-items: center; gap: 12px; background: var(--row); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; margin-top: 8px; }
    .row .t { flex: 1; min-width: 0; font-size: 16px; }
    .row .m { display: block; color: var(--ink-3); font-size: 13px; }
    .tick { width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--line-2); background: none; color: var(--ink); font-size: 20px; flex: none; }
    .tick:active { transform: translateY(1px); }
    .pill { min-height: 44px; padding: 10px 18px; border-radius: 9999px; border: 1px solid var(--line-2); background: var(--row); color: var(--ink); font-size: 16px; font-weight: 500; }
    .pill.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; }
    .pill:disabled { opacity: .45; }
    .pills { display: flex; flex-wrap: wrap; gap: 8px; }
    .field { width: 100%; min-height: 48px; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--bg); color: var(--ink); font-size: 16px; }
    .field:focus { outline: 2px solid var(--accent); outline-offset: 2px; border-color: var(--accent); }
    .stack { display: flex; gap: 8px; margin-top: 8px; }
    .empty { color: var(--ink-3); font-size: 14px; margin: 8px 0 0; }
    .toast { position: fixed; left: 16px; right: 16px; bottom: 16px; background: var(--panel); border: 1px solid var(--line-2); border-radius: 12px; padding: 12px 16px; font-size: 15px; box-shadow: 0 12px 40px rgba(14,21,38,.72); display: none; } /* tokens-ok */
    .toast.on { display: block; }
    .late { color: var(--late); } .ok { color: var(--ok); } .caution { color: var(--caution); }
    .camera { position: relative; overflow: hidden; display: inline-block; }
    .camera input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; }
    .pinform { max-width: 360px; margin: 48px auto; }
    .pinform .field { font-size: 24px; letter-spacing: .3em; text-align: center; }
    .err { color: var(--late); font-size: 14px; min-height: 20px; margin: 8px 0 0; }
  `
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#15161C"><title>Bench.</title><style>${css}</style></head>` // tokens-ok
  if (locked) return `${head}<body><div class="pinform panel"><h1>Bench.</h1><p class="meta">Too many wrong PINs from this phone. Wait five minutes and reload.</p></div></body></html>`
  if (!authed) return `${head}<body><form class="pinform panel" id="f"><h1>Bench.</h1><p class="meta">The PIN from Settings, on the workshop network.</p>
<input class="field" id="pin" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" autofocus aria-label="PIN" placeholder="PIN"><p class="err" id="err"></p>
<button class="pill primary" type="submit" style="width:100%">Open</button></form>
<script>
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault()
  const err = document.getElementById('err'); err.textContent = ''
  const r = await fetch('/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: document.getElementById('pin').value.trim() }) })
  if (r.ok) location.reload(); else err.textContent = (await r.json().catch(() => ({}))).error || 'Wrong PIN.'
})
</script></body></html>`
  return `${head}<body>
<h1>Bench.</h1><p class="meta" id="line">Loading the day.</p>
<section class="panel" id="clock"><h2>Clock.</h2><div class="pills" id="punches"></div><p class="empty" id="clockline"></p></section>
<section class="panel"><h2>Today.</h2><div id="today"></div>
<form class="stack" id="add"><input class="field" id="title" placeholder="Quick add to Today" aria-label="New task" autocomplete="off"><button class="pill primary" type="submit">Add</button></form></section>
<section class="panel"><h2>Photo.</h2><p class="empty" style="margin:0 0 10px">A picture goes to the inbox folder; attach it to a task on the Board.</p>
<label class="pill camera">Take a photo<input type="file" accept="image/*" capture="environment" id="camera" aria-label="Take a photo"></label></section>
<div class="toast" id="toast" role="status"></div>
<script>
const $ = s => document.querySelector(s)
const H = { 'Content-Type': 'application/json' }
const LABEL = ${JSON.stringify(PUNCH_LABEL)}
let toastTimer = null
const toast = (t) => { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 3200) }
const hm = ms => { const m = Math.round(ms / 60000); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? H : {}, body: body ? JSON.stringify(body) : undefined })
  if (r.status === 401) { location.reload(); throw new Error('PIN needed.') }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || ('Bench answered ' + r.status))
  return j
}
async function load() {
  try {
    const b = await api('GET', '/api/brief')
    const parts = [b.count + ' on Today']
    if (b.due) parts.push(b.due + ' due')
    if (b.orders) parts.push(b.orders + (b.orders === 1 ? ' order date' : ' order dates'))
    if (b.meetings.length) parts.push(b.meetings.length + (b.meetings.length === 1 ? ' meeting' : ' meetings') + ': ' + b.meetings.map(m => m.subject + (m.start ? ' ' + m.start : '')).join(', '))
    $('#line').textContent = (b.name ? b.name + ', ' : '') + parts.join(', ') + '.'
    $('#punches').innerHTML = b.clock.valid.map(k => '<button class="pill' + (k === 'in' || k === 'out' ? ' primary' : '') + '" data-punch="' + k + '">' + LABEL[k] + '</button>').join('')
    $('#clockline').textContent = (b.clock.status === 'off' ? 'Not clocked in.' : b.clock.status === 'out' ? 'Clocked out, ' + hm(b.clock.worked) + ' today.' : b.clock.status === 'lunch' ? 'At lunch, ' + hm(b.clock.worked) + ' so far.' : hm(b.clock.worked) + ' on the clock.') + (b.clock.pending ? ' ' + b.clock.pending + ' not yet on the sheet.' : '')
    $('#today').innerHTML = b.today.length ? b.today.map(t => '<div class="row"><button class="tick" data-tick="' + t.id + '" aria-label="Done: ' + esc(t.title) + '">&#10003;</button><span class="t">' + esc(t.title) + (t.project || t.effortHours ? '<span class="m">' + esc([t.project, t.effortHours ? t.effortHours + ' h' : null].filter(Boolean).join(', ')) + '</span>' : '') + '</span></div>').join('') : '<p class="empty">Today is empty. Pull from Active on the Board, or add one below.</p>'
  } catch (e) { $('#line').textContent = e.message }
}
document.addEventListener('click', async (e) => {
  const tick = e.target.closest('[data-tick]'), punch = e.target.closest('[data-punch]')
  try {
    if (tick) { tick.disabled = true; await api('POST', '/api/tick', { id: tick.dataset.tick }); toast('Done.'); await load() }
    if (punch) { punch.disabled = true; await api('POST', '/api/punch', { kind: punch.dataset.punch }); toast(LABEL[punch.dataset.punch] + '.'); await load() }
  } catch (err) { toast(err.message); await load() }
})
$('#add').addEventListener('submit', async (e) => {
  e.preventDefault()
  const title = $('#title').value.trim(); if (!title) return
  try { const r = await api('POST', '/api/add', { title }); $('#title').value = ''; toast(r.note || 'On Today.'); await load() } catch (err) { toast(err.message) }
})
$('#camera').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return
  toast('Sending the photo.')
  try {
    const r = await fetch('/photo', { method: 'POST', headers: { 'Content-Type': f.type || 'image/jpeg' }, body: f })
    const j = await r.json().catch(() => ({}))
    toast(r.ok ? 'In the inbox as ' + j.name + '.' : (j.error || 'The photo did not arrive.'))
  } catch (err) { toast(err.message) }
  e.target.value = ''
})
load()
setInterval(load, 60000)
</script></body></html>`
}

// ── the server and the settings poll ──────────────────────────────────
let server = null, serverPin = null, poll = null
export const info = () => {
  const on = Boolean(server?.listening)
  const addresses = lanAddresses()
  return { on, port: PORT, addresses, url: on && addresses.length ? `http://${addresses[0]}:${PORT}` : null, configured: Boolean(settings.get().phoneAccess && validPin(settings.get().phonePin)) }
}
function listen(pin, { log = console.log } = {}) {
  return new Promise((resolve) => {
    const app = createApp({ pin })
    const s = http.createServer(app)
    s.on('error', err => { log(`[phone] could not listen on ${PORT}: ${err.message}`); server = null; resolve(false) })
    s.listen(PORT, '0.0.0.0', () => {
      server = s; serverPin = pin
      const addrs = lanAddresses()
      log(`[phone] on ${addrs.length ? addrs.map(a => `http://${a}:${PORT}`).join(', ') : `port ${PORT}`} behind the PIN`)
      resolve(true)
    })
  })
}
export function stop() {
  if (poll) { clearInterval(poll); poll = null }
  return new Promise((resolve) => { if (!server) return resolve(); const s = server; server = null; serverPin = null; s.close(() => resolve()); s.closeAllConnections?.() })
}
/** One look at Settings: bring the server up, take it down, or restart it on a new PIN. */
export async function check({ log = console.log } = {}) {
  const { phoneAccess, phonePin } = settings.get()
  const want = Boolean(phoneAccess) && validPin(phonePin)
  if (want && server && serverPin === phonePin) return 'on'
  if (want) {
    if (server) { const s = server; server = null; await new Promise(r => s.close(r)); log('[phone] PIN changed, restarting') }
    return (await listen(phonePin, { log })) ? 'on' : 'failed'
  }
  if (server) { const s = server; server = null; serverPin = null; await new Promise(r => s.close(r)); s.closeAllConnections?.(); log('[phone] off') }
  return 'off'
}
export function start({ log = console.log } = {}) {
  if (poll) return
  check({ log }).catch(err => log('[phone]', err.message))
  poll = setInterval(() => check({ log }).catch(err => log('[phone]', err.message)), POLL_MS)
  poll.unref?.()
}

export function registerRoutes(app) {
  app.get('/api/phone', wrap((_req, res) => res.json(info())))
}
