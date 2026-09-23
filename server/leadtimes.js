/**
 * Learned lead times (roadmap 70). Every part that was ordered and then marked delivered is one sample
 * for its supplier: ordered-on to delivered-on in calendar days. The median per supplier is what the
 * order-by suggestion uses; a supplier we have never bought from gets ten working days.
 *
 * Samples come from the board's own fields (supplier, orderedOn, deliveredOn) and from BOM parts,
 * whose sync puts supplier, orderedOn and deliveryDate into task.meta.
 */
import * as store from './store.js'

const DAY = 86400000
export const DEFAULT_WORKING_DAYS = 10
export const key = (s) => String(s || '').trim().toLowerCase()
const asDate = (iso) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso)) ? new Date(iso.slice(0, 10) + 'T12:00:00') : null
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysBetween = (a, b) => Math.round((b - a) / DAY)

/** Median of a list of numbers; the mean of the middle two when the count is even. */
export const median = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/** One task's sample, or null: { supplier, days, orderedOn, deliveredOn, taskId }. */
export function sampleOf(t) {
  const supplier = t.supplier || t.meta?.supplier
  const orderedOn = t.orderedOn || t.meta?.orderedOn
  const deliveredOn = t.deliveredOn || t.meta?.deliveryDate
  if (!supplier || !orderedOn || !deliveredOn) return null
  const a = asDate(orderedOn), b = asDate(deliveredOn)
  if (!a || !b) return null
  const days = daysBetween(a, b)
  if (days < 0 || days > 365) return null   // a typo, not a lead time
  return { supplier: String(supplier).trim(), days, orderedOn: orderedOn.slice(0, 10), deliveredOn: deliveredOn.slice(0, 10), taskId: t.id }
}

/** Per supplier: samples (days), median, last (most recent delivery), count. Sorted by supplier name. */
export function stats(tasks = store.allTasks()) {
  const by = new Map()
  for (const t of tasks) {
    const s = sampleOf(t)
    if (!s) continue
    const k = key(s.supplier)
    if (!by.has(k)) by.set(k, { key: k, supplier: s.supplier, samples: [], rows: [] })
    by.get(k).rows.push(s)
  }
  return [...by.values()].map(g => {
    g.rows.sort((a, b) => a.deliveredOn.localeCompare(b.deliveredOn))
    const samples = g.rows.map(r => r.days)
    return { key: g.key, supplier: g.supplier, samples, median: median(samples), last: samples.at(-1), count: samples.length }
  }).sort((a, b) => a.supplier.localeCompare(b.supplier))
}

/** n working days back from a date, Saturdays and Sundays skipped. */
export function workingDaysBefore(date, n) {
  const d = new Date(date)
  let left = n
  while (left > 0) { d.setDate(d.getDate() - 1); if (d.getDay() !== 0 && d.getDay() !== 6) left-- }
  return d
}
const backToWeekday = (d) => { while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1); return d }

/**
 * When to order so the part lands by needBy: { orderBy, days, basis, samples, supplier }.
 * basis 'learned' uses the supplier's median (calendar days); 'default' is ten working days.
 * `days` is always the calendar distance from orderBy to needBy, so the UI can show one number.
 */
export function suggest({ supplier, needBy } = {}, tasks = store.allTasks()) {
  const s = stats(tasks).find(x => x.key === key(supplier))
  const need = asDate(needBy)
  const learned = Boolean(s && s.median !== null)
  let orderBy = null
  if (need) {
    const d = learned ? new Date(need.getTime() - s.median * DAY) : workingDaysBefore(need, DEFAULT_WORKING_DAYS)
    orderBy = ymd(backToWeekday(d))
  }
  const days = need && orderBy ? daysBetween(asDate(orderBy), need) : (learned ? s.median : 14)
  return { orderBy, days, basis: learned ? 'learned' : 'default', samples: s?.samples || [], supplier: s?.supplier || (String(supplier || '').trim() || null), needBy: need ? ymd(need) : null }
}

/** Express routes; `wrap` is the server's promise-to-response helper. */
export function registerRoutes(app, wrap) {
  app.get('/api/leadtimes', wrap((_req, res) => res.json(stats())))
  app.get('/api/leadtimes/suggest', wrap((req, res) => res.json(suggest({ supplier: req.query.supplier, needBy: req.query.needBy }))))
}
