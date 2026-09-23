/**
 * The weather over Oetwil am See, for the lunch screen. One call to Open-Meteo (no key), cached for
 * fifteen minutes, never throws: offline means { ok: false } and the line stays hidden.
 *
 *   GET /api/weather -> { ok, temp, code, words, rainNextHour, sunrise, sunset, at }
 */

const LAT = 47.27, LON = 8.72
export const URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,precipitation,weather_code&hourly=precipitation_probability&daily=sunrise,sunset&timezone=Europe%2FZurich&forecast_days=1`
const TTL = 15 * 60 * 1000

/** WMO weather interpretation codes, in plain words. Unknown codes read as "changeable". */
const WORDS = [
  [[0], 'clear'],
  [[1], 'mostly clear'],
  [[2], 'partly cloudy'],
  [[3], 'overcast'],
  [[45, 48], 'fog'],
  [[51, 53, 55], 'drizzle'],
  [[56, 57], 'freezing drizzle'],
  [[61], 'light rain'],
  [[63], 'rain'],
  [[65], 'heavy rain'],
  [[66, 67], 'freezing rain'],
  [[71], 'light snow'],
  [[73], 'snow'],
  [[75], 'heavy snow'],
  [[77], 'snow grains'],
  [[80], 'light showers'],
  [[81], 'showers'],
  [[82], 'heavy showers'],
  [[85], 'snow showers'],
  [[86], 'heavy snow showers'],
  [[95], 'a thunderstorm'],
  [[96, 99], 'a thunderstorm with hail']
]
export function describe(code) {
  const n = Number(code)
  if (!Number.isFinite(n)) return 'changeable'
  const hit = WORDS.find(([codes]) => codes.includes(n))
  return hit ? hit[1] : 'changeable'
}

const hhmm = (iso) => typeof iso === 'string' && iso.length >= 16 ? iso.slice(11, 16) : null
const oneDecimal = (n) => Math.round(Number(n) * 10) / 10

/**
 * Shape the Open-Meteo answer. The chance of rain is the hourly probability for the hour after the
 * current reading; Open-Meteo returns local times as strings, so the comparison is on the strings.
 */
export function shape(j, now = new Date()) {
  const cur = j?.current || {}
  const hourly = j?.hourly || {}
  const times = hourly.time || [], probs = hourly.precipitation_probability || []
  const ref = typeof cur.time === 'string' ? cur.time : now.toISOString().slice(0, 16)
  let i = times.findIndex(t => t > ref)
  if (i === -1) i = times.length - 1
  const rain = i >= 0 && probs[i] !== null && probs[i] !== undefined ? Math.round(Number(probs[i])) : null
  return {
    ok: true,
    temp: oneDecimal(cur.temperature_2m),
    code: Number(cur.weather_code),
    words: describe(cur.weather_code),
    rainNextHour: rain,
    sunrise: hhmm(j?.daily?.sunrise?.[0]),
    sunset: hhmm(j?.daily?.sunset?.[0]),
    at: new Date().toISOString()
  }
}

let cached = null, cachedAt = 0
export async function current({ force = false, fetchImpl = fetch } = {}) {
  if (!force && cached && Date.now() - cachedAt < TTL) return cached
  let result
  try {
    const r = await fetchImpl(URL, { headers: { 'User-Agent': 'Bench' }, signal: AbortSignal.timeout(8000) })
    if (!r.ok) throw new Error(`open-meteo ${r.status}`)
    result = shape(await r.json())
    if (!Number.isFinite(result.temp)) throw new Error('no reading')
  } catch (err) {
    // A failed call is not cached for the full quarter hour; the next screen visit tries again after a minute.
    result = { ok: false, reason: err.name === 'TimeoutError' ? 'timeout' : 'offline', message: err.message, at: new Date().toISOString() }
    cached = result; cachedAt = Date.now() - TTL + 60_000
    return result
  }
  cached = result; cachedAt = Date.now()
  return result
}

export function registerRoutes(app) {
  const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))
  app.get('/api/weather', wrap(async (req, res) => res.json(await current({ force: req.query.force === '1' }))))
}
