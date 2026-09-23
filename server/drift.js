/**
 * Sheet drift check (roadmap 74). Bench writes punches to the Zeiterfassung workbook; people also edit
 * that workbook by hand. Once in a while, read the month sheet back and compare In, Out and Break
 * with what Bench holds, to the minute. The result is cached for 30 minutes per month; it never throws,
 * a failed check comes back with ok false and a reason.
 *
 * Columns: C Vormittag kommt, D Vormittag geht, E Nachmittag kommt, F Nachmittag geht, G Pause.
 * Bench's in is C, out is F, break is (E minus D) plus G.
 */
import { getTokenSilent } from './auth.js'
import * as timeclock from './timeclock.js'

export const TOLERANCE_MIN = 1
export const CACHE_MS = 30 * 60_000
const cache = new Map()   // ym -> { at, result }

const pad = (n) => String(n).padStart(2, '0')
export const hhmm = (min) => min === null || min === undefined ? '' : `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
const localMinutes = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes() }

/** A sheet cell to minutes of the day: Excel keeps a time as a fraction of a day, a hand edit may leave text. */
export function cellMinutes(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Math.round((v % 1) * 1440)
  const m = /^\s*(\d{1,2})[:.](\d{2})/.exec(String(v))
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/**
 * The pure comparison. benchDays: [{ date, in, out, breakMs }] (ISO times), sheetRows: { [date]: [C, D, E, F, G] }.
 * A day without an In in Bench is not compared; a field Bench has no value for is skipped; a value the
 * sheet lacks counts as a difference with sheet ''.
 */
export function compare(benchDays, sheetRows, tolerance = TOLERANCE_MIN) {
  const rows = []
  for (const d of benchDays) {
    if (!d.in) continue
    const cells = sheetRows[d.date]
    if (!cells) continue
    const [c, dOut, e, f, g] = cells.map(cellMinutes)
    const sheetBreak = (dOut !== null && e !== null ? Math.max(0, e - dOut) : 0) + (g || 0)
    const want = [
      ['in', localMinutes(d.in), c],
      d.out ? ['out', localMinutes(d.out), f] : null,
      d.out ? ['break', Math.round((d.breakMs || 0) / 60000), (dOut === null && e === null && g === null) ? null : sheetBreak] : null
    ].filter(Boolean)
    for (const [field, bench, sheet] of want) {
      if (sheet === null && field === 'break' && bench === 0) continue   // no break both sides
      if (sheet === null || Math.abs(bench - sheet) > tolerance) rows.push({ date: d.date, field, bench: hhmm(bench), sheet: hhmm(sheet) })
    }
  }
  return rows
}

/** The month's rows A..G in one read, keyed by date. Rows are found by column A's serial, the layout is the fallback. */
async function readSheet(token, y, mo, dates) {
  const first = new Date(y, mo - 1, 1, 12)
  const sheet = await timeclock.sheetFor(token, first)
  const base = timeclock.workbookBase(y)
  const r = await timeclock.graph(token, `${base}/worksheets('${encodeURIComponent(sheet)}')/range(address='A1:G45')?$select=values`)
  const values = r?.values || []
  const out = {}
  for (const date of dates) {
    const d = new Date(date + 'T12:00:00')
    const serial = timeclock.serialOf(d)
    let idx = values.findIndex(([a]) => typeof a === 'number' && Math.round(a) === serial)
    if (idx < 0) idx = timeclock.layoutRow(d) - 1
    const row = values[idx]
    if (row) out[date] = row.slice(2, 7)
  }
  return { sheet, rows: out }
}

/** { ok, rows, checkedAt, reason, sheet, days }. ok is true when the check ran; rows lists the differences. */
export async function check(ym, { force = false } = {}) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || '')
  const nowD = new Date()
  const y = m ? Number(m[1]) : nowD.getFullYear(), mo = m ? Number(m[2]) : nowD.getMonth() + 1
  const k = `${y}-${pad(mo)}`
  const hit = cache.get(k)
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.result
  const checkedAt = new Date().toISOString()
  let result
  try {
    const token = await getTokenSilent()
    if (!token) result = { ok: false, rows: [], checkedAt, reason: 'needs-signin' }
    else {
      // days Bench knows in this month, with nothing still waiting to be written (those would differ by definition)
      const month = timeclock.month(k)
      const days = month.days.filter(d => d.in && !d.pending && !d.failed)
      if (!days.length) result = { ok: true, rows: [], checkedAt, reason: null, sheet: month.sheet, days: 0 }
      else {
        const { sheet, rows } = await readSheet(token, y, mo, days.map(d => d.date))
        result = { ok: true, rows: compare(days, rows), checkedAt, reason: null, sheet, days: days.length }
      }
    }
  } catch (err) {
    result = { ok: false, rows: [], checkedAt, reason: timeclock.plainError(err) }
  }
  cache.set(k, { at: Date.now(), result })
  return result
}
export function forget() { cache.clear() }

/** Express routes; `wrap` is the server's promise-to-response helper. */
export function registerRoutes(app, wrap) {
  app.get('/api/timeclock/drift', wrap(async (req, res) => res.json(await check(String(req.query.ym || ''), { force: req.query.force === '1' }))))
}
