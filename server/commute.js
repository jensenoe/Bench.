/**
 * The drive home and the drive in, with live traffic (roadmap 120). Noël drives; the trains do not help.
 *
 * Provider: TomTom (a free key, 2,500 calls a day; Bench uses about forty). The key and the home place
 * live in the per-user settings, never in the shared folder, never in the export. The home place is
 * geocoded once through Open-Meteo's free geocoder and kept in BENCH_USER_DIR/commute.json. Work is
 * Oetwil am See.
 *
 *   estimate({ direction })   'home' (work to home) or 'in' (home to work), cached five minutes
 *   line(est, direction)      one sentence for the hero
 *   GET /api/commute?direction=home|in
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as settings from './settings.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const USER_DIR = process.env.BENCH_USER_DIR || process.env.BENCH_SECRETS_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data')
const FILE = path.join(USER_DIR, 'commute.json')
const WORK = { lat: 47.27, lon: 8.72, name: 'Oetwil am See' }
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))

let memo = null
const load = () => { if (memo) return memo; try { memo = JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { memo = {} } return memo }
const save = () => { try { fs.mkdirSync(USER_DIR, { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(memo, null, 2)); fs.renameSync(FILE + '.tmp', FILE) } catch { /* not worth a dialog */ } }

/** Where home is: the settings' place name, geocoded once (Swiss results first) and remembered by name. */
export async function homeCoords({ fetchImpl = fetch } = {}) {
  const place = settings.get().homePlace
  if (!place) return null
  const m = load()
  if (m.home?.place === place && m.home.lat) return m.home
  const r = await fetchImpl(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=5&language=de&format=json`)
  if (!r.ok) throw new Error(`geocoder ${r.status}`)
  const j = await r.json()
  const hit = (j.results || []).find(x => x.country_code === 'CH') || (j.results || [])[0]
  if (!hit) throw new Error(`no place called ${place}`)
  m.home = { place, lat: hit.latitude, lon: hit.longitude, name: hit.name, admin: hit.admin1 || null }
  save()
  return m.home
}

/** TomTom's route summary, reduced to what the line needs. Pure, tested. */
export function reduceRoute(json) {
  const s = json?.routes?.[0]?.summary
  if (!s) return null
  const minutes = Math.round((s.travelTimeInSeconds || 0) / 60)
  const usual = Math.round((s.noTrafficTravelTimeInSeconds || s.travelTimeInSeconds || 0) / 60)
  return { minutes, usual, delay: Math.max(0, minutes - usual), km: Math.round((s.lengthInMeters || 0) / 1000) }
}

/** The worst incident inside the route's box: the road and the place, from TomTom's incident details. Pure, tested. */
export function worstIncident(json) {
  const list = (json?.incidents || []).map(i => i.properties || {}).filter(p => (p.delay || 0) > 0)
  if (!list.length) return null
  const p = list.sort((a, b) => (b.delay || 0) - (a.delay || 0))[0]
  const road = (p.roadNumbers || [])[0] || null
  const where = p.from || p.to || null
  const what = (p.events || [])[0]?.description || null
  return { road, where, what, delayMin: Math.round((p.delay || 0) / 60) }
}

/** One sentence. delay under 5 minutes is "clear roads"; otherwise the extra minutes and the worst spot. */
export function line(est, direction = 'home') {
  if (!est) return null
  const head = direction === 'home' ? 'Home in' : 'The drive in:'
  const base = direction === 'home' ? `${head} ${est.minutes} minutes` : `${head} ${est.minutes} minutes`
  if (est.delay < 5) return `${base}, clear roads.`
  const spot = est.worst ? `: ${[est.worst.road, est.worst.where].filter(Boolean).join(' at ')}${est.worst.what ? `, ${est.worst.what.toLowerCase()}` : ''}` : ''
  return `${base}, ${est.delay} more than usual${spot}.`
}

const cache = { home: null, in: null }
const TTL = 5 * 60_000
const bbox = (a, b) => { const pad = 0.02; return [Math.min(a.lon, b.lon) - pad, Math.min(a.lat, b.lat) - pad, Math.max(a.lon, b.lon) + pad, Math.max(a.lat, b.lat) + pad].join(',') }

export async function estimate({ direction = 'home', force = false, fetchImpl = fetch, now = Date.now() } = {}) {
  const key = settings.get().trafficKey
  if (!key) return { ok: false, reason: 'no-key' }
  let home
  try { home = await homeCoords({ fetchImpl }) } catch (err) { return { ok: false, reason: err.message } }
  if (!home) return { ok: false, reason: 'no-home' }
  const c = cache[direction]
  if (!force && c && now - c.at < TTL) return c.value
  const from = direction === 'home' ? WORK : home, to = direction === 'home' ? home : WORK
  try {
    const r = await fetchImpl(`https://api.tomtom.com/routing/1/calculateRoute/${from.lat},${from.lon}:${to.lat},${to.lon}/json?traffic=true&travelMode=car&routeType=fastest&key=${encodeURIComponent(key)}`)
    if (r.status === 403 || r.status === 401) return { ok: false, reason: 'bad-key' }
    if (!r.ok) return { ok: false, reason: `tomtom ${r.status}` }
    const est = reduceRoute(await r.json())
    if (!est) return { ok: false, reason: 'no-route' }
    let worst = null
    if (est.delay >= 5) {
      try {
        const q = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${bbox(from, to)}&fields=${encodeURIComponent('{incidents{properties{delay,from,to,roadNumbers,events{description}}}}')}&language=de-CH&timeValidityFilter=present&key=${encodeURIComponent(key)}`
        const ir = await fetchImpl(q)
        if (ir.ok) worst = worstIncident(await ir.json())
      } catch { worst = null }
    }
    const value = { ok: true, direction, ...est, worst, from: from.name, to: to.name || to.place, at: new Date(now).toISOString(), text: line({ ...est, worst }, direction) }
    cache[direction] = { at: now, value }
    return value
  } catch (err) {
    return { ok: false, reason: /fetch failed|ENOTFOUND|ECONN|ETIMEDOUT/i.test(err.message) ? 'offline' : err.message }
  }
}

/** Which drive matters now: in before 08:30 while not clocked in, home from 15:30 while clocked in or just out. */
export function directionFor(now = new Date(), clockStatus = 'off') {
  const m = now.getHours() * 60 + now.getMinutes()
  if (m < 8 * 60 + 30 && clockStatus !== 'in') return 'in'
  if (m >= 15 * 60 + 30 && clockStatus !== 'off') return 'home'
  return null
}

export function registerRoutes(app) {
  app.get('/api/commute', wrap(async (req, res) => res.json(await estimate({ direction: req.query.direction === 'in' ? 'in' : 'home', force: req.query.force === '1' }))))
}
