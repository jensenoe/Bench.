import library from './library.json'

/**
 * The pictures follow the sky. Four scenes set by the real sunrise and sunset; inside each scene
 * the photograph changes every hour, and the hour-to-picture mapping shifts from day to day.
 *
 * Eleven libraries share that clock (Alps, Tropics, Urban, Monochrome, Pacific Northwest, Desert,
 * Brutalist, Italian coast, Canada, Autumn, Gothic).
 * Any subset can be switched on; the pools are interleaved so consecutive hours change mood.
 * Photos arrive via fetch-photos.bat; until then each scene falls back to a procedural render.
 */
/**
 * Each scene also grades the photographs: `filter` runs on the picture itself, `grade` is the colour laid
 * over it in soft light (see .grade in index.css). Dawn and dusk lean warm, day and night lean cool, so
 * pictures from eleven libraries and dozens of photographers read as one product.
 */
const SCENES = {
  dawn:  { label: 'Dawn',  start: 5,  glow: '#3A2C4A', accent: '#F0A483', accentInk: '#2A1810', filter: 'saturate(.9) contrast(1.04) sepia(.1)',            grade: '240,164,131', light: { glow: '#F1DCD2', accent: '#B85A34', accentInk: '#FFF7F2' } },
  day:   { label: 'Day',   start: 9,  glow: '#1B2A3C', accent: '#8CC4F5', accentInk: '#0A1C2E', filter: 'saturate(.86) contrast(1.05)',                     grade: '140,180,230', light: { glow: '#D9E6F2', accent: '#2E6CA8', accentInk: '#F3F8FD' } },
  dusk:  { label: 'Dusk',  start: 17, glow: '#3A2038', accent: '#F09468', accentInk: '#2A140A', filter: 'saturate(.92) contrast(1.05) sepia(.12)',          grade: '236,140,104', light: { glow: '#F1D9D0', accent: '#B9501F', accentInk: '#FFF6F1' } },
  night: { label: 'Night', start: 21, glow: '#0E1526', accent: '#9DB9E6', accentInk: '#0A1428', filter: 'saturate(.8) contrast(1.06) brightness(.94)',      grade: '96,116,168',  light: { glow: '#D7DEEC', accent: '#3A5B96', accentInk: '#F4F6FB' } }
}
/** Functional colours as tokens (index.css defines them per theme). Keys kept for the components. */
export const STATUS = { overdue: 'var(--late)', caution: 'var(--caution)', held: 'var(--held)', done: 'var(--ok)', muted: 'rgba(var(--ink-rgb),.7)' }

export const COLLECTIONS = ['alps', 'tropics', 'urban', 'mono', 'pnw', 'desert', 'brutalist', 'italy', 'canada', 'autumn', 'gothic'].map(key => ({ key, label: library[key].label }))
export const DEFAULT_COLLECTIONS = COLLECTIONS.map(c => c.key)

/**
 * Sunrise and sunset for Oetwil am See (NOAA algorithm, good to a minute or two). The scenes follow
 * the real sky, so "Dawn" means the sun is actually low: in June that is 05:30, in December 08:00.
 */
const LAT = 47.27, LON = 8.72
const rad = x => x * Math.PI / 180, deg = x => x * 180 / Math.PI
export function sunTimes(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0)
  const n = Math.floor((d - start) / 86400000)
  const calc = (rising) => {
    const t = n + ((rising ? 6 : 18) - LON / 15) / 24
    const M = (0.9856 * t) - 3.289
    let L = M + 1.916 * Math.sin(rad(M)) + 0.020 * Math.sin(rad(2 * M)) + 282.634
    L = ((L % 360) + 360) % 360
    let RA = deg(Math.atan(0.91764 * Math.tan(rad(L))))
    RA = ((RA % 360) + 360) % 360
    RA += (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)
    RA /= 15
    const sinDec = 0.39782 * Math.sin(rad(L)), cosDec = Math.cos(Math.asin(sinDec))
    const cosH = (Math.cos(rad(90.833)) - sinDec * Math.sin(rad(LAT))) / (cosDec * Math.cos(rad(LAT)))
    if (cosH > 1 || cosH < -1) return null
    const H = (rising ? 360 - deg(Math.acos(cosH)) : deg(Math.acos(cosH))) / 15
    const T = H + RA - 0.06571 * t - 6.622
    const UT = ((T - LON / 15) % 24 + 24) % 24
    const out = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0))
    out.setTime(out.getTime() + UT * 3600000)
    return out
  }
  const sunrise = calc(true) || new Date(d.getFullYear(), d.getMonth(), d.getDate(), 7, 0)
  const sunset = calc(false) || new Date(d.getFullYear(), d.getMonth(), d.getDate(), 19, 0)
  return { sunrise, sunset }
}
export const isDark = (d = new Date()) => { const { sunrise, sunset } = sunTimes(d); return d < sunrise || d > sunset }

/**
 * Dawn runs from forty minutes before sunrise to an hour after it; dusk from an hour before sunset
 * to forty minutes after. Night is the rest. A bare hour still works for the settings previews.
 */
export function keyFor(x) {
  if (typeof x === 'number') return x < 5 || x >= 21 ? 'night' : x < 9 ? 'dawn' : x < 17 ? 'day' : 'dusk'
  const d = x instanceof Date ? x : new Date()
  const { sunrise, sunset } = sunTimes(d)
  const m = 60000, t = d.getTime()
  if (t < sunrise.getTime() - 40 * m) return 'night'
  if (t < sunrise.getTime() + 60 * m) return 'dawn'
  if (t < sunset.getTime() - 60 * m) return 'day'
  if (t < sunset.getTime() + 40 * m) return 'dusk'
  return 'night'
}
const dayOfYear = (d) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000)
const src = (p) => `/terrain/${p.file}`

/** Enabled libraries. Set from settings; kept here so every scene lookup sees the same answer. */
let enabled = DEFAULT_COLLECTIONS
export function setCollections(keys) {
  const ok = (keys || []).filter(k => library[k])
  enabled = ok.length ? ok : DEFAULT_COLLECTIONS
}
export const getCollections = () => enabled

/** How often the picture changes, in minutes. Settings picks 10, 20, 30 or 60. */
export const CADENCES = [10, 20, 30, 60]
let cadence = 20
export function setCadence(min) { cadence = CADENCES.includes(Number(min)) ? Number(min) : 20 }
export const getCadence = () => cadence
/** One slot per cadence window since midnight, shifted by the day so the same time on Tuesday shows a different picture than on Monday. */
const slotOf = (d, shift = 0) => Math.floor((d.getHours() * 60 + d.getMinutes()) / cadence) + dayOfYear(d) * 7 + shift
/** The next moment the picture changes. The clock uses it for "next picture at". */
export function nextChange(d = new Date()) {
  const m = d.getHours() * 60 + d.getMinutes()
  const next = (Math.floor(m / cadence) + 1) * cadence
  const out = new Date(d); out.setHours(0, next, 0, 0); return out
}

/**
 * One library per slot. Every photograph on screen in that slot (hero, doors, page headers)
 * comes from the same library, so a Pacific Northwest morning is Pacific Northwest all the
 * way down. The library changes with the picture when more than one is enabled.
 */
export function libraryFor(d = new Date(), shift = 0) {
  if (enabled.length === 1) return enabled[0]
  return enabled[((slotOf(d, shift) % enabled.length) + enabled.length) % enabled.length]
}
export const libraryLabel = (key) => library[key]?.label || key

export function imageFor(scene, d = new Date(), shift = 0) {
  const lib = libraryFor(d, shift)
  const imgs = (library[lib]?.[scene] || []).map(src)
  if (!imgs.length) return `/terrain/${scene}.jpg`
  return imgs[((slotOf(d, shift) * 5) % imgs.length + imgs.length) % imgs.length]
}

const build = (k, d, shift = 0) => ({ key: k, ...SCENES[k], ...library._sky[k], library: libraryFor(d, shift), terrain: imageFor(k, d, shift), fallback: `/terrain/${k}.jpg` })
export function sceneFor(d = new Date()) { return build(keyFor(d), d) }
export const ALL_SCENES = Object.keys(SCENES).map(k => { const d = new Date(); d.setHours(SCENES[k].start, 0, 0, 0); return build(k, d) })
/** A given scene's picture for this moment; shift moves along the pool so two headers never share one picture. */
export function sceneAt(key, d = new Date(), shift = 0) { return build(key, d, shift) }

/** Lunch: a village at dusk, lights coming on. Changes with the day, not the hour. */
const LUNCH = { key: 'lunch', label: 'Lunch', glow: '#2E1E33', accent: '#F5B26B', accentInk: '#2A1606', filter: 'saturate(.92) contrast(1.04) sepia(.1)', grade: '245,178,107', light: { glow: '#F3E2D0', accent: '#B0662A', accentInk: '#FFF8F0' } }
export function lunchScene(d = new Date()) {
  const imgs = (library.lunch.images || []).map(src)
  return { ...LUNCH, terrain: imgs.length ? imgs[dayOfYear(d) % imgs.length] : '/terrain/dusk.jpg', fallback: '/terrain/dusk.jpg' }
}

/** Cover for the Cockpit door: an office, a bench. Rotates weekly. */
export function cockpitCover(d = new Date()) {
  const imgs = (library.cockpit.images || []).map(src)
  return { src: imgs.length ? imgs[Math.floor(dayOfYear(d) / 7) % imgs.length] : '/terrain/night.jpg', fallback: '/terrain/night.jpg' }
}

/** Credits for the settings panel. */
export function credits() {
  const out = []
  for (const [k, v] of Object.entries(library)) {
    if (k === '_sky') continue
    for (const s of ['dawn', 'day', 'dusk', 'night', 'images']) for (const p of v[s] || []) if (p.by && p.by !== 'Pexels') out.push(p.by)
  }
  return [...new Set(out)]
}
