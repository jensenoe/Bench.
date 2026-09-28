/**
 * Which days are working days (roadmap 131). Weekends, the public holidays of the canton, and the days
 * off typed into Settings (a company shutdown, a bridge day). Projects plan on these; nothing else in
 * Bench. reads them yet.
 *
 *   holidays(year, region)   Map iso -> name. ZH: the ten Zurich holidays; CH: the four federal ones; none.
 *   parseDaysOff(text)       "2026-12-24 to 2027-01-01, 2027-05-07" -> Set of iso dates (weekdays and weekends)
 *   isOff(iso)               weekend, holiday or a day off, with the settings in force
 *   offBetween(a, b)         the holidays and days off on weekdays in a range, for the plan to show
 *
 * The Zurich list is the canton's public holidays (Ruhetage). Sechseläuten and Knabenschiessen are
 * half days of the city of Zurich only, not the canton; type them into Days off when they apply.
 */
import * as settings from './settings.js'

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const noon = s => new Date(String(s).slice(0, 10) + 'T12:00:00')
const plus = (s, n) => { const d = noon(s); d.setDate(d.getDate() + n); return iso(d) }

/** Easter Sunday in the Gregorian calendar (the anonymous algorithm, Meeus/Jones/Butcher). */
export function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export const REGIONS = ['ZH', 'CH', 'none']
const cache = new Map()
export function holidays(year, region = 'ZH') {
  const key = `${region}:${year}`
  if (cache.has(key)) return cache.get(key)
  const m = new Map()
  if (region !== 'none') {
    const e = easter(year)
    const federal = [[`${year}-01-01`, 'New Year\'s Day'], [plus(e, 39), 'Ascension'], [`${year}-08-01`, 'Swiss National Day'], [`${year}-12-25`, 'Christmas']]
    const zurich = [[`${year}-01-02`, 'Berchtold\'s Day'], [plus(e, -2), 'Good Friday'], [plus(e, 1), 'Easter Monday'], [`${year}-05-01`, 'Labour Day'], [plus(e, 50), 'Whit Monday'], [`${year}-12-26`, 'St Stephen\'s Day']]
    for (const [d, n] of region === 'ZH' ? [...federal, ...zurich] : federal) m.set(d, n)
  }
  cache.set(key, m)
  return m
}

/** Dates and ranges, separated by commas, semicolons or new lines. A range is "a to b" or "a..b". At most 400 days. */
export function parseDaysOff(text = '') {
  const out = new Set()
  for (const part of String(text).split(/[,;\n]+/)) {
    const p = part.trim(); if (!p) continue
    const r = p.match(/^(\d{4}-\d{2}-\d{2})\s*(?:\.\.|to|bis|-)\s*(\d{4}-\d{2}-\d{2})$/i)
    if (r) {
      let [a, b] = [r[1], r[2]]; if (b < a) [a, b] = [b, a]
      for (let d = a, n = 0; d <= b && n < 400; d = plus(d, 1), n++) out.add(d)
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(p)) out.add(p)
  }
  return out
}

let memo = { key: null, extra: new Set(), region: 'ZH' }
/** The rules in force: the region and the typed days off, re-read when the settings change. */
export function rules() {
  const s = settings.get()
  const region = REGIONS.includes(s.holidayRegion) ? s.holidayRegion : 'ZH'
  const key = `${region}|${s.daysOff || ''}`
  if (memo.key !== key) memo = { key, region, extra: parseDaysOff(s.daysOff || '') }
  return memo
}

/** Why a weekday is off, or null when it is a working day. Weekends return 'weekend'. */
export function reasonOff(day, r = rules()) {
  const d = noon(day)
  if (d.getDay() === 0 || d.getDay() === 6) return 'weekend'
  const s = String(day).slice(0, 10)
  return holidays(d.getFullYear(), r.region).get(s) || (r.extra.has(s) ? 'Day off' : null)
}
export const isOff = (day, r = rules()) => reasonOff(day, r) !== null

/** Holidays and days off that fall on weekdays between a and b, both inclusive: [{ date, name }]. */
export function offBetween(a, b, r = rules()) {
  if (!a || !b) return []
  const out = []
  let [from, to] = a <= b ? [a, b] : [b, a]
  for (let d = from, n = 0; d <= to && n < 800; d = plus(d, 1), n++) {
    const why = reasonOff(d, r)
    if (why && why !== 'weekend') out.push({ date: d, name: why })
  }
  return out
}
