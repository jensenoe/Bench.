/**
 * Rüsten on the phone (roadmap 176): workshop mode for the kit, mounted by server/phone.js on its LAN app, so it
 * sits behind the same PIN gate, the same wrong-PIN lock and the same port. It holds no data: every read and
 * write goes to the main Bench on 127.0.0.1 through server/kitting.js, whose cleaning and per-item tick are the
 * only way in. Nothing here touches the kit file or the photo folder.
 *
 *   GET  /kit                         the page (the PIN form for a stranger)
 *   GET  /api/kit/jobs                open jobs: plans with a kit, not all handed over
 *   GET  /api/kit?project=KEY         one kit for the phone: machines, items, photos (no template)
 *   GET  /api/kit/find?project=KEY&machine=ID&q=TEXT   the matching items, best first (findItems)
 *   POST /api/kit/tick                { project, machine, item, field, value }: one tick, last write per item wins
 *   POST /api/kit/photo?project=KEY&machine=ID[&item=ID][&caption=TEXT]   raw image bytes, 12 MB
 *   POST /api/kit/photo?project=KEY&machine=ID&photo=ID&rendition=small   the reduced copy, 1 MB
 *   GET  /api/kit/photo?project=KEY&machine=ID&file=NAME                  the picture
 *
 * The page is one HTML string with inline CSS and JS, like the day page. Scanning: a USB or Bluetooth scanner
 * types into the search field and presses Enter, which works everywhere. The camera (BarcodeDetector and
 * getUserMedia) needs a secure context, which a plain http page on the LAN is not, so its button only shows
 * where both exist; "Scan from a photo" needs BarcodeDetector only, and shows only where it exists.
 */
import express from 'express'
import { KINDS, KIND_LABEL, STOCK_KINDS, MAX, PHOTO_FILE, findItems, nextOpen } from './kitting-rules.js'

export const KIT_PHOTO_MAX = 12 * 1024 * 1024
export const KIT_SMALL_MAX = 1024 * 1024
const KEY = /^(?:plan:[\w-]{1,80}|I-\d{3,5})$/i
const ID = /^[\w-]{1,64}$/
const TICKS = ['kitted', 'checked', 'stockUpdated']
const enc = encodeURIComponent
const one = v => typeof v === 'string' ? v : ''
const keyOf = v => KEY.test(one(v)) ? one(v) : null
const idOf = v => ID.test(one(v)) ? one(v) : null
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))
const bad = (res, error) => res.status(400).json({ error })

/** What the phone needs of a kit view from the main app: the machines with their items and photos. */
export function trimView(view) {
  const d = view?.doc || {}
  return {
    key: view?.plan?.key || d.project || null, name: view?.plan?.name || '', updatedAt: d.updatedAt || null, complete: view?.complete ?? null,
    machines: (Array.isArray(d.machines) ? d.machines : []).map(m => ({
      id: m.id, number: m.number, bundle: m.bundle ?? null, label: m.label || '', presentedOn: m.presentedOn || null, handedOverOn: m.handedOverOn || null,
      items: (m.items || []).map(i => ({ id: i.id, kind: i.kind, name: i.name, partNumber: i.partNumber || '', qty: i.qty, unit: i.unit || '', note: i.note || '', kitted: i.kitted === true, checked: i.checked === true, stockUpdated: i.stockUpdated === true })),
      photos: (m.photos || []).map(p => ({ id: p.id, file: p.file, small: p.small || null, at: p.at || null, caption: p.caption || '', itemId: p.itemId || null }))
    }))
  }
}

/**
 * Mounts the routes on the phone app. Call it after the app's `/api` gate, so every /api/kit route needs the PIN
 * before a byte of the body is read. `main` is the JSON proxy to the main app, `mainRaw` the byte proxy,
 * `authed` and `locked` the gate's own answers for the page, `shell` the shared head and PIN pages.
 */
export function registerKit(app, { main, mainRaw, authed, locked, shell }) {
  app.get('/kit', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (locked(req)) return res.status(429).type('html').send(shell.locked('Rüsten. Bench.'))
    res.type('html').send(authed(req) ? kitPage(shell) : shell.pin('Rüsten. Bench.'))
  })

  app.get('/api/kit/jobs', wrap(async (_req, res) => res.json(await main('GET', '/api/kitting/jobs'))))
  app.get('/api/kit', wrap(async (req, res) => {
    const key = keyOf(req.query.project)
    if (!key) return bad(res, 'Which job?')
    res.json(trimView(await main('GET', `/api/kitting?project=${enc(key)}`)))
  }))
  app.get('/api/kit/find', wrap(async (req, res) => {
    const key = keyOf(req.query.project), machine = idOf(req.query.machine), q = one(req.query.q).slice(0, 120)
    if (!key || !machine) return bad(res, 'Which job and machine?')
    const view = trimView(await main('GET', `/api/kitting?project=${enc(key)}`))
    const m = view.machines.find(x => x.id === machine)
    if (!m) return res.status(404).json({ error: 'That machine is not on this kit any more.' })
    res.json({ q, items: findItems(KINDS.flatMap(k => m.items.filter(i => i.kind === k)), q).slice(0, 20) })
  }))
  app.post('/api/kit/tick', express.json({ limit: '4kb' }), wrap(async (req, res) => {
    const b = req.body || {}
    const key = keyOf(b.project), machine = idOf(b.machine), item = idOf(b.item)
    if (!key || !machine || !item) return bad(res, 'Which job, machine and item?')
    if (!TICKS.includes(b.field) || typeof b.value !== 'boolean') return bad(res, 'Say kitted, checked or stockUpdated, as true or false.')
    res.json(await main('PATCH', `/api/kitting/tick?project=${enc(key)}`, { machine, item, [b.field]: b.value }))
  }))

  const raw = express.raw({ type: () => true, limit: KIT_PHOTO_MAX + 1 })
  app.post('/api/kit/photo', (req, res, next) => raw(req, res, err => err
    ? res.status(err.status === 413 ? 413 : 400).json({ error: err.status === 413 ? 'That picture is over 12 MB.' : 'The picture did not arrive whole.' })
    : next()), wrap(async (req, res) => {
    const key = keyOf(req.query.project), machine = idOf(req.query.machine)
    if (!key || !machine) return bad(res, 'Which job and machine?')
    if (!Buffer.isBuffer(req.body) || !req.body.length) return bad(res, 'No picture arrived.')
    const small = req.query.rendition === 'small'
    if (req.body.length > (small ? KIT_SMALL_MAX : KIT_PHOTO_MAX)) return res.status(413).json({ error: small ? 'The small copy is over 1 MB.' : 'That picture is over 12 MB.' })
    const params = new URLSearchParams({ project: key, machine })
    if (small) {
      const photo = idOf(req.query.photo)
      if (!photo) return bad(res, 'Which photo?')
      params.set('photo', photo); params.set('rendition', 'small')
    } else {
      const item = one(req.query.item), caption = one(req.query.caption).slice(0, MAX.caption)
      if (item && !idOf(item)) return bad(res, 'Which item?')
      if (item) params.set('item', item)
      if (caption.trim()) params.set('caption', caption)
    }
    const r = await mainRaw('POST', `/api/kitting/photo?${params}`, { body: req.body, type: 'application/octet-stream' })
    res.status(r.status).json(r.json ?? { error: `Bench. answered ${r.status}.` })
  }))
  app.get('/api/kit/photo', wrap(async (req, res) => {
    const key = keyOf(req.query.project), machine = idOf(req.query.machine), file = one(req.query.file)
    if (!key || !machine || !PHOTO_FILE.test(file)) return bad(res, 'Which picture?')
    const r = await mainRaw('GET', `/api/kitting/photo?${new URLSearchParams({ project: key, machine, file })}`)
    if (r.status !== 200) return res.status(r.status).json(r.json ?? { error: 'No such picture.' })
    res.set('Cache-Control', 'private, max-age=3600').type(r.type || 'application/octet-stream').send(r.buf)
  }))
}

// ── the page ──────────────────────────────────────────────────────────
const KIT_CSS = `
    body.kit { padding: 0 16px 120px; font-size: 17px; }
    [hidden] { display: none !important; }
    .tnum { font-variant-numeric: tabular-nums; }
    .top { display: flex; align-items: center; min-height: 52px; }
    .back { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 8px 0 0; color: var(--ink-2); font-size: 16px; text-decoration: none; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .back::before { content: "\\2039"; font-size: 28px; line-height: 1; }
    h1 { font-size: 30px; line-height: 1.1; margin: 4px 0 6px; overflow-wrap: anywhere; }
    .meta { font-size: 16px; color: var(--ink-2); }
    .list { list-style: none; margin: 0; padding: 0; }
    .card { display: block; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; margin-top: 10px; color: var(--ink); text-decoration: none; min-height: 64px; }
    .r1 { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .big { font-size: 21px; font-weight: 600; overflow-wrap: anywhere; }
    .sub { display: block; color: var(--ink-2); font-size: 15px; margin-top: 2px; }
    .state { font-size: 15px; color: var(--ink-2); white-space: nowrap; }
    .okc { color: var(--ok); font-weight: 600; }
    .bars { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
    .bar span { display: flex; justify-content: space-between; gap: 4px; font-size: 14px; color: var(--ink-2); }
    .bar i { display: block; height: 6px; border-radius: 3px; background: var(--line-2); margin-top: 5px; overflow: hidden; }
    .bar i b { display: block; height: 100%; background: var(--ink-2); }
    .bar.full span { color: var(--ok); }
    .bar.full i b { background: var(--ok); }
    .tools { position: sticky; top: 0; z-index: 10; background: var(--bg); padding: 8px 0 10px; border-bottom: 1px solid var(--line); }
    .findf { display: flex; gap: 8px; }
    .findf .field { font-size: 18px; min-height: 52px; background: var(--panel); }
    .findf .pill { min-height: 52px; flex: none; }
    .tight { margin-top: 8px; }
    .tight .pill { min-height: 44px; font-size: 15px; padding: 8px 14px; }
    .hint { color: var(--ink-3); font-size: 14px; margin: 8px 0 0; }
    .found { margin-top: 10px; background: var(--panel); border: 2px solid var(--accent); border-radius: 12px; padding: 12px 14px; }
    .found p { margin: 0 0 10px; font-size: 17px; overflow-wrap: anywhere; }
    .found .pill { min-height: 52px; font-size: 17px; }
    .acts { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 0; }
    .kind h2 { font-size: 19px; margin: 26px 0 2px; }
    .kind h2 span { color: var(--ink-3); font-weight: 400; margin-left: 4px; }
    .item { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-top: 10px; scroll-margin-top: 230px; }
    .item.done { border-color: var(--ok); }
    .item.gone { display: none; }
    .item.hit { outline: 3px solid var(--accent); outline-offset: 2px; }
    .ih { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
    .iname { font-size: 19px; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }
    .item.done .iname::before { content: "\\2713  "; color: var(--ok); }
    .iqty { font-size: 16px; color: var(--ink-2); white-space: nowrap; }
    .ipn { margin: 4px 0 0; font-size: 17px; color: var(--ink); letter-spacing: .02em; }
    .inote { margin: 4px 0 0; font-size: 15px; color: var(--ink-2); }
    .ticks { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) 70px; gap: 8px; margin-top: 12px; }
    .tk { position: relative; min-height: 60px; border-radius: 12px; border: 2px solid var(--line-2); background: transparent; color: var(--ink); font-family: inherit; font-size: 15px; font-weight: 600; line-height: 1.1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 6px 2px; }
    .tk .box { width: 22px; height: 22px; border: 2px solid currentColor; border-radius: 4px; display: grid; place-items: center; font-size: 15px; line-height: 1; }
    .tk[aria-pressed="true"] { background: var(--ok); border-color: var(--ok); color: var(--ok-ink); }
    .tk[aria-pressed="true"] .box::after { content: "\\2713"; font-weight: 700; }
    .tk.na { border-style: dashed; color: var(--ink-3); font-weight: 500; text-align: center; }
    .tk.cam { overflow: hidden; color: var(--ink-2); font-weight: 500; }
    .tk.cam input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; }
    .tk:active, .pill:active { transform: translateY(1px); }
    .photos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
    .photos a { display: block; min-height: 44px; color: var(--ink-2); font-size: 13px; text-decoration: none; }
    .photos img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 12px; background: var(--row); border: 1px solid var(--line); }
    .photos span { display: block; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sheet { position: fixed; inset: 0; z-index: 40; background: color-mix(in srgb, var(--bg) 72%, transparent); }
    .sheet .in { position: absolute; left: 0; right: 0; bottom: 0; background: var(--panel); border-top: 1px solid var(--line-2); border-radius: 20px 20px 0 0; padding: 20px 16px 28px; box-shadow: 0 -12px 40px var(--shade); }
    .sheet img { display: block; max-width: 100%; max-height: 38vh; border-radius: 12px; margin: 0 auto 14px; }
    .lbl { display: block; color: var(--ink-2); font-size: 15px; margin-bottom: 6px; }
    .scanner { position: fixed; inset: 0; z-index: 50; background: var(--bg); display: flex; flex-direction: column; gap: 12px; padding: 16px; }
    .scanner video { width: 100%; flex: 1; min-height: 0; object-fit: cover; border-radius: 12px; background: var(--panel); }
    .scanner p { margin: 0; color: var(--ink-2); font-size: 16px; }
`

const json = v => JSON.stringify(v).replace(/</g, '\\u003c')

/** The Rüsten page: jobs, then a job's machines, then one machine's items, by the hash (#/k/<key>/<machine>). */
export function kitPage(shell) {
  return `${shell.head(shell.css + KIT_CSS, 'Rüsten. Bench.')}<body class="kit">
<nav class="top"><a class="back" id="back" href="/">Bench.</a></nav>
<div class="tools" id="tools" hidden>
  <form class="findf" id="find" role="search"><input class="field" id="q" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Part number or name" aria-label="Find an item by part number or name"><button class="pill primary" type="submit">Find</button></form>
  <div class="pills tight"><button type="button" class="pill" id="next">Next open item</button><button type="button" class="pill" id="cam" hidden>Scan with camera</button><label class="pill camera" id="scanPhoto" hidden>Scan from a photo<input type="file" accept="image/*" capture="environment" id="scanIn" aria-label="Scan a barcode from a photo"></label></div>
  <p class="hint" id="scanHint">A barcode scanner types here: scan, Enter finds.</p>
  <div class="found" id="found" hidden aria-live="polite"></div>
</div>
<main id="view"><p class="meta">Asking Bench. for the kits.</p></main>
<div class="sheet" id="sheet" hidden><div class="in" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
  <h2 id="sheetTitle">Photo.</h2><img id="prev" alt="The photo to save">
  <label class="lbl" for="cap">Caption for Service, if it helps</label><input class="field" id="cap" maxlength="${MAX.caption}" autocomplete="off" enterkeyhint="done">
  <div class="acts"><button type="button" class="pill primary" id="sheetSave">Save photo</button><button type="button" class="pill" id="sheetCancel">Cancel</button></div>
</div></div>
<div class="scanner" id="scanner" hidden role="dialog" aria-modal="true" aria-label="Scan with the camera"><video id="video" playsinline muted></video><p>Hold the barcode in the frame.</p><button type="button" class="pill" id="scanClose">Close</button></div>
<div class="toast" id="toast" role="status"></div>
<script>
const KINDS = ${json(KINDS)}, KIND_LABEL = ${json(KIND_LABEL)}, STOCK = ${json(STOCK_KINDS)}, MAX_BYTES = ${KIT_PHOTO_MAX}
${findItems.toString()}
${nextOpen.toString()}
const $ = s => document.querySelector(s)
const enc = encodeURIComponent
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const needsStock = i => STOCK.includes(i.kind)
const isDone = i => i.kitted && i.checked && (!needsStock(i) || i.stockUpdated)
const ordered = items => KINDS.flatMap(k => items.filter(i => i.kind === k))
const qs = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'))
const headline = s => /[.!?]$/.test(s) ? s : s + '.'
const qtyText = i => { const q = String(i.qty).replace('.', ','); return i.unit ? q + ' ' + i.unit : 'Qty ' + q }
const VERB = { kitted: 'Tick kitted', checked: 'Tick checked', stockUpdated: 'Tick stock updated' }
const S = { view: null, key: null, mid: null, openOnly: false, hit: null, hits: [], hitIx: 0, busy: 0, foundAt: 0, pending: null, canCamera: false, canPhotoScan: false }
let toastTimer = null
const toast = t => { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 3600) }
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  if (r.status === 401) { location.reload(); throw new Error('PIN needed.') }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || ('Bench. answered ' + r.status))
  return j
}
function counts(items) {
  const st = items.filter(needsStock)
  const c = { total: items.length, kitted: items.filter(i => i.kitted).length, checked: items.filter(i => i.checked).length, stockNeeded: st.length, stock: st.filter(i => i.stockUpdated).length }
  c.open = items.filter(i => !isDone(i)).length
  c.complete = c.total > 0 && c.open === 0
  return c
}
const bar = (label, v, t) => '<span class="bar' + (t > 0 && v >= t ? ' full' : '') + '"><span><span>' + label + '</span><span class="tnum">' + v + '/' + t + '</span></span><i><b style="width:' + (t ? Math.round(v / t * 100) : 0) + '%"></b></i></span>'
const bars = c => '<span class="bars">' + bar('Kitted', c.kitted, c.total) + bar('Checked', c.checked, c.total) + bar('Stock', c.stock, c.stockNeeded) + '</span>'
const photoSrc = (m, p, small) => '/api/kit/photo?' + qs({ project: S.key, machine: m.id, file: small && p.small ? p.small : p.file })
function route() {
  const parts = location.hash.replace(/^#\\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  return parts[0] === 'k' ? { key: parts[1] || null, mid: parts[2] || null } : { key: null, mid: null }
}
const machineNow = () => S.view && S.mid ? S.view.machines.find(m => m.id === S.mid) || null : null
const setBack = (href, text) => { const a = $('#back'); a.href = href; a.textContent = text }

async function show() {
  const r = route()
  const moved = r.key !== S.key || r.mid !== S.mid
  S.key = r.key; S.mid = r.mid
  if (moved) { S.hit = null; S.hits = []; $('#found').hidden = true; $('#q').value = '' }
  $('#tools').hidden = !r.mid
  try {
    if (!r.key) return await showJobs()
    S.view = await api('GET', '/api/kit?project=' + enc(r.key))
    if (!r.mid) return showMachines()
    showMachine()
    if (moved) window.scrollTo(0, 0)
  } catch (e) { $('#view').innerHTML = '<h1>Rüsten.</h1><p class="meta">' + esc(e.message) + '</p>' }
}
async function showJobs() {
  setBack('/', 'Bench.')
  const { jobs } = await api('GET', '/api/kit/jobs')
  $('#view').innerHTML = '<h1>Rüsten.</h1>' + (jobs.length
    ? '<p class="meta">' + plural(jobs.length, 'job') + ' with a kit. Pick one.</p><ul class="list">' + jobs.map(j => '<li><a class="card" href="#/k/' + enc(j.key) + '"><span class="r1"><span class="big">' + esc(j.name) + '</span><span class="state">' + (j.complete === j.machines ? '<span class="okc">Complete</span>' : plural(j.open, 'item') + ' open') + '</span></span><span class="sub">' + plural(j.machines, 'machine') + ', ' + j.complete + ' complete</span>' + bars({ kitted: j.kitted, checked: j.checked, total: j.total, stock: j.stock, stockNeeded: j.stockNeeded }) + '</a></li>').join('') + '</ul>'
    : '<p class="meta">No kit is open. A kit starts in the Rüsten tab of a plan on the desktop.</p>')
}
function showMachines() {
  const v = S.view
  setBack('#/', 'Rüsten')
  const all = counts(v.machines.flatMap(m => m.items))
  $('#view').innerHTML = '<h1>' + esc(headline(v.name || 'Kit')) + '</h1><p class="meta">' + plural(v.machines.length, 'machine') + ', ' + v.machines.filter(m => counts(m.items).complete).length + ' complete. ' + (all.open ? plural(all.open, 'item') + ' open.' : 'Every item is done.') + '</p>'
    + (v.machines.length ? '<ul class="list">' + v.machines.map(m => {
      const c = counts(m.items)
      const sub = [m.bundle ? 'Bundle ' + m.bundle : 'No bundle', m.label, m.photos.length ? plural(m.photos.length, 'photo') : null].filter(Boolean).join(', ')
      return '<li><a class="card" href="#/k/' + enc(v.key) + '/' + enc(m.id) + '"><span class="r1"><span class="big tnum">' + esc(m.number) + '</span><span class="state">' + (c.complete ? '<span class="okc">Complete</span>' : c.total ? plural(c.open, 'item') + ' open' : 'No items yet') + '</span></span><span class="sub">' + esc(sub) + '</span>' + bars(c) + '</a></li>'
    }).join('') + '</ul>' : '<p class="meta">No machines on this kit yet.</p>')
}
function stateLine(m) {
  const c = counts(m.items)
  if (!c.total) return 'No items yet. They are added on the desktop.'
  if (c.complete) return 'Complete. Every item is kitted, checked and booked.'
  return c.kitted + ' of ' + c.total + ' kitted, ' + c.checked + ' of ' + c.total + ' checked, stock ' + c.stock + ' of ' + c.stockNeeded + '.'
}
const tk = (i, f, label) => '<button type="button" class="tk" data-f="' + f + '" aria-pressed="' + (i[f] === true) + '" aria-label="' + label + ': ' + esc(i.name) + '"><span class="box" aria-hidden="true"></span>' + label + '</button>'
function itemHtml(i) {
  return '<article class="item' + (isDone(i) ? ' done' : '') + (S.openOnly && isDone(i) && S.hit !== i.id ? ' gone' : '') + (S.hit === i.id ? ' hit' : '') + '" id="it-' + esc(i.id) + '" data-id="' + esc(i.id) + '">'
    + '<div class="ih"><span class="iname">' + esc(i.name) + '</span><span class="iqty tnum">' + esc(qtyText(i)) + '</span></div>'
    + (i.partNumber ? '<p class="ipn tnum">' + esc(i.partNumber) + '</p>' : '')
    + (i.note ? '<p class="inote">' + esc(i.note) + '</p>' : '')
    + '<div class="ticks">' + tk(i, 'kitted', 'Kitted') + tk(i, 'checked', 'Checked') + (needsStock(i) ? tk(i, 'stockUpdated', 'Stock') : '<span class="tk na">No stock</span>')
    + '<label class="tk cam">Photo<input type="file" accept="image/*" capture="environment" data-photo="' + esc(i.id) + '" aria-label="Add a photo of ' + esc(i.name) + '"></label></div></article>'
}
function showMachine() {
  const m = machineNow()
  setBack('#/k/' + enc(S.key), S.view.name || 'Kit')
  if (!m) { $('#tools').hidden = true; $('#view').innerHTML = '<h1>Gone.</h1><p class="meta">That machine is not on this kit any more.</p>'; return }
  const focus = document.activeElement && document.activeElement.closest ? document.activeElement : null
  const keep = focus && focus.closest('.item') ? { id: focus.closest('.item').dataset.id, f: focus.dataset.f } : null
  const groups = KINDS.map(k => [k, m.items.filter(i => i.kind === k)]).filter(([, l]) => l.length)
  const pics = m.photos.length ? '<div class="photos">' + m.photos.map(p => { const it = p.itemId ? m.items.find(i => i.id === p.itemId) : null; const cap = p.caption || (it ? it.name : 'Machine ' + m.number); return '<a href="' + esc(photoSrc(m, p, false)) + '" target="_blank" rel="noopener"><img src="' + esc(photoSrc(m, p, true)) + '" alt="' + esc(cap) + '" loading="lazy"><span>' + esc(cap) + '</span></a>' }).join('') + '</div>' : ''
  $('#view').innerHTML = '<h1 class="tnum">Machine ' + esc(m.number) + '.</h1><p class="meta" id="mstate">' + esc([m.bundle ? 'Bundle ' + m.bundle : null, m.label].filter(Boolean).join(', ')) + (m.bundle || m.label ? '. ' : '') + esc(stateLine(m)) + '</p>'
    + '<div class="pills"><label class="pill camera">Add photo<input type="file" accept="image/*" capture="environment" data-photo="" aria-label="Add a photo of machine ' + esc(m.number) + '"></label><button type="button" class="pill" id="openOnly" aria-pressed="' + S.openOnly + '">' + (S.openOnly ? 'Show all items' : 'Open items only') + '</button></div>'
    + pics
    + groups.map(([k, list]) => '<section class="kind"><h2>' + esc(KIND_LABEL[k]) + '<span class="tnum">' + list.length + '</span></h2>' + list.map(itemHtml).join('') + '</section>').join('')
    + (m.items.length ? '' : '<p class="meta">No items on this machine yet. Add them in the Rüsten tab on the desktop.</p>')
  if (keep) { const el = document.querySelector('#it-' + CSS.escape(keep.id) + (keep.f ? ' [data-f="' + keep.f + '"]' : '')); if (el) el.focus({ preventScroll: true }) }
}
function paint(i) {
  const el = document.getElementById('it-' + i.id)
  if (el) {
    el.classList.toggle('done', isDone(i))
    el.querySelectorAll('.tk[data-f]').forEach(b => b.setAttribute('aria-pressed', String(i[b.dataset.f] === true)))
  }
  const m = machineNow(), line = $('#mstate')
  if (m && line) line.textContent = [m.bundle ? 'Bundle ' + m.bundle : null, m.label].filter(Boolean).join(', ') + (m.bundle || m.label ? '. ' : '') + stateLine(m)
  if (S.hit === i.id && !$('#found').hidden) found(i, '', true)
}
async function flip(id, f) {
  const m = machineNow(), i = m && m.items.find(x => x.id === id)
  if (!i) return
  const value = !(i[f] === true)
  i[f] = value; paint(i); S.busy++
  try {
    const r = await api('POST', '/api/kit/tick', { project: S.key, machine: m.id, item: id, field: f, value })
    Object.assign(i, r.item); S.view.updatedAt = r.updatedAt; paint(i)
    if (navigator.vibrate) navigator.vibrate(12)
  } catch (err) { i[f] = !value; paint(i); toast(err.message) } finally { S.busy-- }
}

// ── finding ──
const firstMissing = i => !i.kitted ? 'kitted' : !i.checked ? 'checked' : needsStock(i) && !i.stockUpdated ? 'stockUpdated' : null
function found(i, text, quiet) {
  const box = $('#found'); box.hidden = false
  if (!i) { box.innerHTML = '<p>Nothing on this machine matches <b>' + esc(text) + '</b>.</p>'; $('#q').select(); return }
  const f = firstMissing(i), more = S.hits.length - 1
  box.innerHTML = '<p><b>' + esc(i.name) + '</b>' + (i.partNumber ? ' <span class="tnum">' + esc(i.partNumber) + '</span>' : '') + (more > 0 ? '<span class="sub">' + plural(more, 'more item') + ' match.</span>' : '') + '</p><div class="pills">'
    + (f ? '<button type="button" class="pill primary" id="foundTick" data-f="' + f + '">' + VERB[f] + '</button>' : '<span class="okc">Done: kitted, checked' + (needsStock(i) ? ', booked' : '') + '.</span>')
    + (more > 0 ? '<button type="button" class="pill" id="nextHit">Next match</button>' : '') + '</div>'
  if (quiet) return
  S.foundAt = Date.now()
  const t = $('#foundTick')
  if (t) t.focus({ preventScroll: true }); else $('#q').select()
}
function mark(i) {
  document.querySelectorAll('.item.hit').forEach(x => x.classList.remove('hit'))
  S.hit = i.id
  const el = document.getElementById('it-' + i.id)
  if (el) { el.classList.remove('gone'); el.classList.add('hit'); el.scrollIntoView({ block: 'start', behavior: 'smooth' }) }
  found(i)
}
function find(text) {
  const m = machineNow(); if (!m) return
  const t = String(text || '').trim(); if (!t) return
  S.hits = findItems(ordered(m.items), t); S.hitIx = 0
  if (!S.hits.length) { S.hit = null; document.querySelectorAll('.item.hit').forEach(x => x.classList.remove('hit')); found(null, t); return }
  mark(S.hits[0])
}
function goNext() {
  const m = machineNow(); if (!m) return
  const n = nextOpen(ordered(m.items), S.hit, isDone)
  if (!n) { toast(m.items.length ? 'Every item on this machine is done.' : 'No items on this machine yet.'); return }
  S.hits = [n]; mark(n)
}

// ── scanning: the camera and photos only where the browser really has BarcodeDetector ──
let detector = null, stream = null, scanning = false
async function initScan() {
  if (!('BarcodeDetector' in window)) return
  try { const formats = await window.BarcodeDetector.getSupportedFormats(); if (!formats || !formats.length) return; detector = new window.BarcodeDetector({ formats }) } catch (e) { return }
  S.canPhotoScan = true
  S.canCamera = Boolean(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  $('#scanPhoto').hidden = false
  $('#cam').hidden = !S.canCamera
}
async function startCamera() {
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }) } catch (e) { toast('The camera did not open. ' + e.message); return }
  const v = $('#video'); v.srcObject = stream; $('#scanner').hidden = false; scanning = true
  await v.play().catch(() => {})
  const loop = async () => {
    if (!scanning) return
    try { const codes = await detector.detect(v); if (codes.length) { const val = codes[0].rawValue; stopCamera(); $('#q').value = val; find(val); return } } catch (e) { /* the next frame */ }
    setTimeout(loop, 250)
  }
  loop()
}
function stopCamera() { scanning = false; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; $('#scanner').hidden = true }
async function scanPhoto(file) {
  try {
    const bmp = await createImageBitmap(file)
    const codes = await detector.detect(bmp)
    if (!codes.length) { toast('No barcode in that photo. Closer and with more light helps.'); return }
    $('#q').value = codes[0].rawValue; find(codes[0].rawValue)
  } catch (e) { toast('That photo could not be read.') }
}

// ── photos: made smaller on the phone (1600 px, and 480 px for the handover), then sent ──
async function shrink(file, max, quality) {
  try {
    const bmp = await createImageBitmap(file)
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s))
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    if (bmp.close) bmp.close()
    return await new Promise(r => c.toBlob(r, 'image/jpeg', quality))
  } catch (e) { return null }
}
let prevUrl = null
function pickPhoto(file, itemId) {
  S.pending = { file, itemId }
  if (prevUrl) URL.revokeObjectURL(prevUrl)
  prevUrl = URL.createObjectURL(file); $('#prev').src = prevUrl
  const m = machineNow(), it = itemId && m ? m.items.find(i => i.id === itemId) : null
  $('#sheetTitle').textContent = it ? 'Photo of ' + it.name + '.' : 'Photo of ' + (m ? m.number : 'the machine') + '.'
  $('#cap').value = ''; $('#sheet').hidden = false; $('#cap').focus()
}
function closeSheet() { $('#sheet').hidden = true; S.pending = null; if (prevUrl) { URL.revokeObjectURL(prevUrl); prevUrl = null } }
async function savePhoto() {
  const p = S.pending, m = machineNow(); if (!p || !m) return closeSheet()
  const caption = $('#cap').value.trim()
  closeSheet(); toast('Sending the photo.')
  try {
    const full = (await shrink(p.file, 1600, 0.82)) || p.file
    if (full.size > MAX_BYTES) throw new Error('That picture is over 12 MB.')
    const r = await fetch('/api/kit/photo?' + qs({ project: S.key, machine: m.id, item: p.itemId, caption }), { method: 'POST', headers: { 'Content-Type': full.type || 'application/octet-stream' }, body: full })
    if (r.status === 401) { location.reload(); return }
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'The photo did not arrive.')
    const small = await shrink(p.file, 480, 0.72)
    if (small) await fetch('/api/kit/photo?' + qs({ project: S.key, machine: m.id, photo: j.photo.id, rendition: 'small' }), { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: small }).catch(() => {})
    toast('Photo saved on ' + m.number + '.')
    await refresh(true)
  } catch (err) { toast(err.message) }
}

// ── refresh: what the desktop changed shows up here within 20 seconds ──
async function refresh(force) {
  if (!S.key || S.busy || !$('#sheet').hidden || scanning) return
  try {
    const v = await api('GET', '/api/kit?project=' + enc(S.key))
    if (!force && S.view && v.updatedAt === S.view.updatedAt) return
    S.view = v
    if (S.mid) { const y = window.scrollY; showMachine(); window.scrollTo(0, y) } else showMachines()
  } catch (e) { /* the next round */ }
}

document.addEventListener('click', e => {
  const b = e.target.closest('.item .tk[data-f]')
  if (b) { flip(b.closest('.item').dataset.id, b.dataset.f); return }
  const ft = e.target.closest('#foundTick')
  if (ft) { if (Date.now() - S.foundAt < 350) return; flip(S.hit, ft.dataset.f).then(() => $('#q').select()); $('#q').focus({ preventScroll: true }); return }
  if (e.target.closest('#nextHit')) { S.hitIx = (S.hitIx + 1) % S.hits.length; mark(S.hits[S.hitIx]); return }
  if (e.target.closest('#next')) { goNext(); return }
  if (e.target.closest('#openOnly')) { S.openOnly = !S.openOnly; showMachine(); return }
  if (e.target.closest('#cam')) { startCamera(); return }
  if (e.target.closest('#scanClose')) { stopCamera(); return }
  if (e.target.closest('#sheetSave')) { savePhoto(); return }
  if (e.target.closest('#sheetCancel') || e.target === $('#sheet')) closeSheet()
})
document.addEventListener('change', e => {
  const t = e.target
  if (t.matches('input[data-photo]')) { const f = t.files && t.files[0]; const id = t.dataset.photo; t.value = ''; if (f) pickPhoto(f, id) }
  if (t.id === 'scanIn') { const f = t.files && t.files[0]; t.value = ''; if (f && detector) scanPhoto(f) }
})
$('#find').addEventListener('submit', e => { e.preventDefault(); find($('#q').value) })
$('#cap').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); savePhoto() } })
// A scanner types into whatever has focus. On a machine, the first character typed outside a field goes to the
// search field, fresh, so the scanner's Enter finds the item instead of pressing a tick.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#sheet').hidden) closeSheet(); if (scanning) stopCamera(); return }
  if (!S.mid || !$('#sheet').hidden || scanning || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.target.matches && e.target.matches('input, textarea, select')) return
  if (e.key.length === 1 && e.key !== ' ') { const q = $('#q'); q.value = ''; q.focus({ preventScroll: true }) }
})
window.addEventListener('hashchange', show)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(false) })
setInterval(() => { if (document.visibilityState === 'visible') refresh(false) }, 20000)
initScan()
show()
</script></body></html>`
}
