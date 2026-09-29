/**
 * Aerial film for the moving hero on Home (Themes 2.0). The installer ships no video: clips from
 * src/aerials.json are downloaded here on demand, one at a time, into BENCH_USER_DIR/aerials, and served
 * from the app's own origin so the page's Content Security Policy ('self') holds.
 *
 *   GET  /api/aerials             the catalogue, which clips and posters are cached, the cache size
 *   POST /api/aerials/prefetch    { ids } queue these clips (checked against the catalogue); posters come first
 *   POST /api/aerials/clear       empty the cache
 *   GET  /media/aerials/<id>.mp4  a cached clip, with Range support (video needs it to seek and to start early)
 *   GET  /media/aerials/<id>.jpg  a cached poster
 *
 * The cache holds about 1.5 GB; past that the least recently served file goes first. Offline, a download
 * fails quietly, is tried again after a pause, and whatever is cached keeps playing. Nothing cached means the
 * hero keeps the photograph, as it did before.
 */
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { fileURLToPath } from 'node:url'
import * as settings from './settings.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const userDir = () => process.env.BENCH_USER_DIR || process.env.BENCH_SECRETS_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data')
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))

export const CAP = 1.5 * 1024 ** 3
export const MAX_FILE = 150 * 1024 ** 2          // no single clip is near this; it stops a runaway download
export const RETRY_MS = 10 * 60_000              // a failed download waits this long before it is tried again
const HOSTS = ['videos.pexels.com', 'images.pexels.com']
export const NAME = /^(\d{1,12})\.(mp4|jpg)$/
const TYPES = { mp4: 'video/mp4', jpg: 'image/jpeg' }

// ── the catalogue ─────────────────────────────────────────────────────
let catalogue = null
/** src/aerials.json, read once. Packaged builds carry it (package.json "files"). */
export function loadCatalogue() {
  if (catalogue) return catalogue
  try { catalogue = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'aerials.json'), 'utf8')) }
  catch { catalogue = { collections: [] } }
  return catalogue
}
export const allClips = (cat = loadCatalogue()) => (cat.collections || []).flatMap(c => (c.clips || []).map(x => ({ ...x, collection: c.key })))
const clipById = (id) => allClips().find(c => String(c.id) === String(id))

// ── the cache ─────────────────────────────────────────────────────────
/**
 * Files in one folder plus index.json ({ name: { bytes, used } }). `used` moves each time a file is served;
 * past the cap the oldest `used` goes first. The folder is the truth: the index is squared with it on load,
 * so a file deleted by hand simply drops out and a half-written .part is removed.
 */
export function createCache({ dir, cap = CAP, now = () => Date.now() } = {}) {
  const INDEX = path.join(dir, 'index.json')
  let index = null
  let saveTimer = null

  const load = () => {
    if (index) return index
    fs.mkdirSync(dir, { recursive: true })
    let saved = {}
    try { saved = JSON.parse(fs.readFileSync(INDEX, 'utf8')).files || {} } catch {}
    index = {}
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f)
      if (f.endsWith('.part')) { try { fs.rmSync(p, { force: true }) } catch {} continue }
      if (!NAME.test(f)) continue
      let st; try { st = fs.statSync(p) } catch { continue }
      if (!st.isFile()) continue
      index[f] = { bytes: st.size, used: Number(saved[f]?.used) || st.mtimeMs }
    }
    return index
  }
  const save = () => { try { fs.writeFileSync(INDEX, JSON.stringify({ files: index }, null, 1)) } catch {} }
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 2000); saveTimer.unref?.() }

  const cache = {
    dir,
    cap,
    has: (name) => Boolean(load()[name]),
    list: () => Object.keys(load()),
    size: () => Object.values(load()).reduce((s, f) => s + f.bytes, 0),
    file: (name) => path.join(dir, name),
    /** Served or about to be: it moves to the back of the eviction line. */
    touch(name) { const f = load()[name]; if (f) { f.used = now(); saveSoon() } },
    /** A finished download: count it, then make room, never at the expense of `keep` (the file just added). */
    add(name, keep = []) {
      const p = path.join(dir, name)
      const st = fs.statSync(p)
      load()[name] = { bytes: st.size, used: now() }
      const gone = cache.evict([name, ...keep])
      save()
      return gone
    },
    /** Least recently used first, until the total is under the cap. Returns what went. */
    evict(keep = []) {
      const idx = load()
      const gone = []
      let total = cache.size()
      const line = Object.entries(idx).filter(([n]) => !keep.includes(n)).sort((a, b) => a[1].used - b[1].used)
      for (const [n, f] of line) {
        if (total <= cap) break
        // A clip being streamed right now can refuse to go on Windows; it stays counted and goes next time.
        try { fs.rmSync(path.join(dir, n), { force: true }) } catch { continue }
        delete idx[n]; total -= f.bytes; gone.push(n)
      }
      return gone
    },
    clear() {
      const idx = load()
      for (const n of Object.keys(idx)) { try { fs.rmSync(path.join(dir, n), { force: true }); delete idx[n] } catch {} }
      save()
    },
    flush: save
  }
  return cache
}

// ── Range ─────────────────────────────────────────────────────────────
/**
 * "bytes=a-b", "bytes=a-" or "bytes=-n" against a file of `size` bytes. Null means no Range header (send
 * it all); { invalid: true } is a 416. Only the first range of a multi-range request is honoured, which is
 * what media elements ask for.
 */
export function parseRange(header, size) {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)/.exec(String(header).trim())
  if (!m || (m[1] === '' && m[2] === '')) return { invalid: true }
  let start, end
  if (m[1] === '') { const n = Number(m[2]); if (!n) return { invalid: true }; start = Math.max(0, size - n); end = size - 1 }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1) }
  if (start >= size || start > end) return { invalid: true }
  return { start, end }
}

/** Sends a file with Accept-Ranges, 206 for a range, 416 for one it cannot meet. */
export function sendFile(req, res, file, type) {
  let st
  try { st = fs.statSync(file) } catch { res.statusCode = 404; return res.end() }
  const size = st.size
  const r = parseRange(req.headers.range, size)
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Content-Type', type)
  res.setHeader('Cache-Control', 'no-cache')
  if (r?.invalid) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${size}`); return res.end() }
  const { start, end } = r || { start: 0, end: size - 1 }
  res.statusCode = r ? 206 : 200
  if (r) res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
  res.setHeader('Content-Length', size ? end - start + 1 : 0)
  if (req.method === 'HEAD' || !size) return res.end()
  const s = fs.createReadStream(file, { start, end })
  s.on('error', () => res.destroy())
  s.pipe(res)
}

// ── downloads ─────────────────────────────────────────────────────────
let cache = null
const getCache = () => (cache ||= createCache({ dir: path.join(userDir(), 'aerials') }))
/** For the tests: a cache in a folder of their own. */
export function _useCache(c) { cache = c }

const queue = []                 // names waiting: '123.jpg', '123.mp4'
const failedAt = new Map()       // name -> when it last failed
let current = null               // { name, req }
let lastError = null

/** Only the catalogue's own hosts, over https, with a redirect or two. */
function fetchTo(url, dest, hops = 3) {
  return new Promise((resolve, reject) => {
    let u
    try { u = new URL(url) } catch { return reject(new Error('bad address')) }
    if (u.protocol !== 'https:' || !HOSTS.includes(u.hostname)) return reject(new Error(`not a catalogue host: ${u.hostname}`))
    const req = https.get(u, { headers: { 'User-Agent': 'Bench' }, timeout: 30_000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops > 0) {
        res.resume()
        return resolve(fetchTo(new URL(res.headers.location, u).toString(), dest, hops - 1))
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)) }
      const type = String(res.headers['content-type'] || '')
      if (!/^(video|image)\//.test(type)) { res.resume(); return reject(new Error(`unexpected ${type || 'content'}`)) }
      let got = 0
      const out = fs.createWriteStream(dest)
      // Whatever goes wrong mid-file (offline, too large, cleared), the .part is closed so it can be removed.
      const fail = (e) => { res.unpipe(out); out.destroy(); reject(e) }
      res.on('data', (b) => { got += b.length; if (got > MAX_FILE) { req.destroy(); fail(new Error('too large')) } })
      res.on('error', fail)
      res.on('close', () => { if (!res.complete) fail(new Error('connection lost')) })
      out.on('error', fail)
      out.on('finish', () => resolve(got))
      res.pipe(out)
    })
    if (current) current.req = req
    req.on('timeout', () => req.destroy(new Error('timed out')))
    req.on('error', reject)
  })
}

async function pump() {
  if (current) return
  const name = queue.shift()
  if (!name) return
  const c = getCache()
  const [, id, ext] = NAME.exec(name) || []
  const clip = id && clipById(id)
  if (!clip || c.has(name)) return pump()
  const url = ext === 'jpg' ? `${clip.poster}?auto=compress&cs=tinysrgb&w=1920` : clip.file
  const part = c.file(name) + '.part'
  current = { name, req: null }
  try {
    fs.mkdirSync(c.dir, { recursive: true })
    await fetchTo(url, part)
    fs.renameSync(part, c.file(name))
    c.add(name, queue.slice(0, 4))
    failedAt.delete(name)
    lastError = null
  } catch (e) {
    try { fs.rmSync(part, { force: true }) } catch {}
    failedAt.set(name, Date.now())
    lastError = { name, message: e.message, at: new Date().toISOString() }
  } finally {
    current = null
  }
  setImmediate(pump)
}

/** Queue clips by id (their posters first). Unknown ids, cached files and recent failures are skipped. */
export function prefetch(ids = []) {
  const c = getCache()
  const clips = [...new Set(ids.map(String))].map(clipById).filter(Boolean).slice(0, 8)
  const names = [...clips.map(x => `${x.id}.jpg`), ...clips.map(x => `${x.id}.mp4`)]
  let added = 0
  for (const n of names) {
    if (c.has(n) || queue.includes(n) || current?.name === n) continue
    if (Date.now() - (failedAt.get(n) || 0) < RETRY_MS) continue
    queue.push(n); added++
  }
  pump()
  return added
}

export function status() {
  const c = getCache()
  const cached = new Set(c.list())
  const cat = loadCatalogue()
  return {
    collections: (cat.collections || []).map(x => ({ key: x.key, label: x.label })),
    clips: allClips(cat).map(x => ({ id: x.id, collection: x.collection, scene: x.scene, place: x.place, by: x.by || '', ready: cached.has(`${x.id}.mp4`), poster: cached.has(`${x.id}.jpg`) })),
    cache: { bytes: c.size(), cap: c.cap, files: cached.size },
    busy: current?.name || null,
    queued: queue.length,
    lastError
  }
}

export function clear() {
  queue.length = 0
  if (current?.req) current.req.destroy(new Error('cleared'))
  failedAt.clear()
  getCache().clear()
}

export function registerRoutes(app) {
  app.get('/api/aerials', wrap((_req, res) => res.json(status())))
  app.post('/api/aerials/prefetch', wrap((req, res) => {
    // Nothing downloads until the moving hero is switched on.
    if (settings.get().aerials !== true) return res.json({ ...status(), added: 0, off: true })
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(x => /^\d{1,12}$/.test(String(x))) : []
    const added = prefetch(ids)
    res.json({ ...status(), added })
  }))
  app.post('/api/aerials/clear', wrap((_req, res) => { clear(); res.json(status()) }))
  app.get('/media/aerials/:file', (req, res) => {
    const m = NAME.exec(req.params.file || '')
    const c = getCache()
    if (!m || !c.has(req.params.file)) return res.status(404).end()
    c.touch(req.params.file)
    sendFile(req, res, c.file(req.params.file), TYPES[m[2]])
  })
}
