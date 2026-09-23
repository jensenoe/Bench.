/**
 * Is there a newer Bench? Asks GitHub for the latest release of the repo and compares it with
 * package.json. The repo is private, so an anonymous call gets 404: then the answer is "cannot tell,
 * here is the releases page". A fine-grained token with read access to the repo (Settings > About,
 * or GITHUB_TOKEN in .env) makes the check real. Cached for six hours; `force` asks again.
 *
 * Silent updates (roadmap 76): `download()` fetches the installer into the temp folder, `downloaded()`
 * says what is waiting there, and `start()` checks once a day and downloads in the background. The
 * desktop shell runs the installer on quit (bench:install-update in electron/main.cjs).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import * as settings from './settings.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const REPO = process.env.BENCH_UPDATE_REPO || 'jensenoe/Bench.'
export const RELEASES_URL = `https://github.com/${REPO}/releases`
/** Where installers land. The shell only ever runs an .exe from this folder. */
export const DOWNLOAD_DIR = path.join(os.tmpdir(), 'bench-updates')
const USER_DIR = process.env.BENCH_USER_DIR || process.env.BENCH_SECRETS_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data')
const STATE_FILE = path.join(USER_DIR, 'update.json')
const current = () => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version
const token = () => settings.get().updateToken || process.env.GITHUB_TOKEN || ''
const fail = (message, status = 400) => Object.assign(new Error(message), { status })

/** 0.9.0-beta.2 > 0.9.0-beta.1, 0.9.0 > 0.9.0-beta.9, 0.10.0 > 0.9.1. */
export function compare(a, b) {
  const split = v => { const [core, pre] = String(v).replace(/^v/, '').split('-'); return { core: core.split('.').map(Number), pre: pre ? pre.split('.') : null } }
  const A = split(a), B = split(b)
  for (let i = 0; i < 3; i++) { const d = (A.core[i] || 0) - (B.core[i] || 0); if (d) return Math.sign(d) }
  if (!A.pre && !B.pre) return 0
  if (!A.pre) return 1
  if (!B.pre) return -1
  for (let i = 0; i < Math.max(A.pre.length, B.pre.length); i++) {
    const x = A.pre[i], y = B.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = Number(x), ny = Number(y)
    const d = !isNaN(nx) && !isNaN(ny) ? nx - ny : String(x).localeCompare(String(y))
    if (d) return Math.sign(d)
  }
  return 0
}

let cached = null, cachedAt = 0
const SIX_HOURS = 6 * 3600 * 1000

export async function check({ force = false, fetchImpl = fetch } = {}) {
  const cur = current()
  if (!force && cached && Date.now() - cachedAt < SIX_HOURS) return cached
  const tok = token()
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Bench' }
  if (tok) headers.Authorization = `Bearer ${tok}`
  let result
  try {
    const r = await fetchImpl(`https://api.github.com/repos/${REPO}/releases/latest`, { headers })
    if (r.status === 404) result = { current: cur, latest: null, newer: false, url: RELEASES_URL, reason: tok ? 'no-release' : 'private' }
    else if (r.status === 401) result = { current: cur, latest: null, newer: false, url: RELEASES_URL, reason: 'bad-token' }
    else if (!r.ok) result = { current: cur, latest: null, newer: false, url: RELEASES_URL, reason: `github-${r.status}` }
    else {
      const j = await r.json()
      const latest = String(j.tag_name || '').replace(/^v/, '')
      const asset = (j.assets || []).find(a => /^Bench-Setup.*\.exe$/.test(a.name))
      result = {
        current: cur, latest, newer: compare(latest, cur) > 0, url: j.html_url || RELEASES_URL,
        download: asset?.browser_download_url || null, publishedAt: j.published_at || null, reason: null,
        // what download() needs: the asset id is the only way to fetch a file from a private repo
        asset: asset ? { id: asset.id, name: asset.name, size: asset.size || null, url: asset.browser_download_url || null } : null
      }
    }
  } catch {
    result = { current: cur, latest: null, newer: false, url: RELEASES_URL, reason: 'offline' }
  }
  result.checkedAt = new Date().toISOString()
  cached = result; cachedAt = Date.now()
  return result
}

// ── the downloaded installer ─────────────────────────────────────────
let state = null   // { version, path, at, size }
function readState() {
  if (state) return state
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { state = null }
  return state
}
function writeState(next) {
  state = next
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
    if (next) fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2))
    else if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE)
  } catch { /* a missing memo only costs one extra download */ }
}
const complete = (p, size) => { try { const st = fs.statSync(p); return st.isFile() && st.size > 0 && (size == null || st.size === size) } catch { return false } }

/** The installer that is waiting, or null. Forgets one that vanished or is not newer than what runs. */
export function downloaded() {
  const s = readState()
  if (!s) return null
  if (!complete(s.path, s.size) || compare(s.version, current()) <= 0) { writeState(null); return null }
  return { version: s.version, path: s.path, at: s.at }
}

let inflight = null
/**
 * Fetch the latest installer into DOWNLOAD_DIR. Uses the cached check; needs a newer release with an
 * installer asset. With a token the file comes through the API (the only route for a private repo),
 * without one through browser_download_url. Writes a .part file and renames it, skips a file that is
 * already complete. Resolves to { path, version, size }.
 */
export function download({ fetchImpl = fetch } = {}) {
  if (inflight) return inflight
  inflight = doDownload({ fetchImpl }).finally(() => { inflight = null })
  return inflight
}
async function doDownload({ fetchImpl }) {
  const info = await check({ fetchImpl })
  if (info.reason) throw fail(info.reason === 'offline' ? 'GitHub is not reachable right now.' : `Cannot see the releases (${info.reason}).`)
  if (!info.newer) throw fail(`Bench ${info.current} is the latest.`)
  if (!info.asset) throw fail(`Release ${info.latest} has no installer yet.`)
  const name = path.basename(info.asset.name)
  if (!/^[\w.-]+\.exe$/i.test(name)) throw fail(`Unexpected installer name: ${name}`)
  const dest = path.join(DOWNLOAD_DIR, name)
  const known = readState()
  if (complete(dest, info.asset.size) && (info.asset.size != null || (known && known.path === dest && known.version === info.latest && complete(dest, known.size)))) {
    const size = fs.statSync(dest).size
    writeState({ version: info.latest, path: dest, at: known?.at || new Date().toISOString(), size })
    return { path: dest, version: info.latest, size, alreadyThere: true }
  }
  const tok = token()
  const headers = { 'User-Agent': 'Bench' }
  let url
  if (tok) { url = `https://api.github.com/repos/${REPO}/releases/assets/${info.asset.id}`; headers.Accept = 'application/octet-stream'; headers.Authorization = `Bearer ${tok}` }
  else if (info.asset.url) url = info.asset.url
  else throw fail('No way to download this release: add a GitHub token in Settings.')
  const r = await fetchImpl(url, { headers, redirect: 'follow' })
  if (!r.ok) throw fail(`GitHub answered ${r.status} for the installer.`, 502)
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })
  const part = dest + '.part'
  try {
    if (r.body && typeof r.body.getReader === 'function') await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(part))
    else if (r.body && typeof r.body.pipe === 'function') await pipeline(r.body, fs.createWriteStream(part))
    else fs.writeFileSync(part, Buffer.from(await r.arrayBuffer()))
    const size = fs.statSync(part).size
    if (!size) throw fail('The installer came back empty.', 502)
    if (info.asset.size != null && size !== info.asset.size) throw fail(`The installer is ${size} bytes, GitHub said ${info.asset.size}.`, 502)
    fs.renameSync(part, dest)
    writeState({ version: info.latest, path: dest, at: new Date().toISOString(), size })
    return { path: dest, version: info.latest, size }
  } catch (err) {
    try { fs.unlinkSync(part) } catch { /* nothing to remove */ }
    throw err
  }
}

// ── background: check once a day, fetch quietly ──────────────────────
let timers = []
/** Three minutes after start and then daily: check, and download when there is something to fetch. */
export function start({ fetchImpl = fetch, firstMs = 3 * 60_000, everyMs = 24 * 3600 * 1000, log = console.log } = {}) {
  stop()
  const tick = async () => {
    try {
      const info = await check({ force: true, fetchImpl })
      if (!info.newer || !info.asset) return
      if (!token() && !info.asset.url) return
      const have = downloaded()
      if (have && have.version === info.latest) return
      const r = await download({ fetchImpl })
      log(`[updates] Bench ${r.version} downloaded to ${r.path}`)
    } catch (err) { log(`[updates] ${err.message}`) }
  }
  const first = setTimeout(() => { tick(); const iv = setInterval(tick, everyMs); iv.unref?.(); timers.push(iv) }, firstMs)
  first.unref?.()
  timers.push(first)
  return stop
}
export function stop() { for (const t of timers) clearTimeout(t), clearInterval(t); timers = [] }

// ── routes ───────────────────────────────────────────────────────────
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))
/** GET /api/updates (the check plus what is downloaded) and POST /api/updates/download. */
export function registerRoutes(app) {
  app.get('/api/updates', wrap(async (req, res) => res.json({ ...(await check({ force: req.query.force === '1' })), downloaded: downloaded() })))
  app.post('/api/updates/download', wrap(async (_req, res) => res.json(await download())))
}
