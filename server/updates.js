/**
 * Is there a newer Bench? Asks GitHub for the latest release of the repo and compares it with
 * package.json. The repo is private, so an anonymous call gets 404: then the answer is "cannot tell,
 * here is the releases page". A fine-grained token with read access to the repo (Settings > About,
 * or GITHUB_TOKEN in .env) makes the check real. Cached for six hours; `force` asks again.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as settings from './settings.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const REPO = process.env.BENCH_UPDATE_REPO || 'jensenoe/Bench.'
export const RELEASES_URL = `https://github.com/${REPO}/releases`
const current = () => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version

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
  const token = settings.get().updateToken || process.env.GITHUB_TOKEN || ''
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Bench' }
  if (token) headers.Authorization = `Bearer ${token}`
  let result
  try {
    const r = await fetchImpl(`https://api.github.com/repos/${REPO}/releases/latest`, { headers })
    if (r.status === 404) result = { current: cur, latest: null, newer: false, url: RELEASES_URL, reason: token ? 'no-release' : 'private' }
    else if (r.status === 401) result = { current: cur, latest: null, newer: false, url: RELEASES_URL, reason: 'bad-token' }
    else if (!r.ok) result = { current: cur, latest: null, newer: false, url: RELEASES_URL, reason: `github-${r.status}` }
    else {
      const j = await r.json()
      const latest = String(j.tag_name || '').replace(/^v/, '')
      const asset = (j.assets || []).find(a => /^Bench-Setup.*\.exe$/.test(a.name))
      result = { current: cur, latest, newer: compare(latest, cur) > 0, url: j.html_url || RELEASES_URL, download: asset?.browser_download_url || null, publishedAt: j.published_at || null, reason: null }
    }
  } catch {
    result = { current: cur, latest: null, newer: false, url: RELEASES_URL, reason: 'offline' }
  }
  result.checkedAt = new Date().toISOString()
  cached = result; cachedAt = Date.now()
  return result
}
