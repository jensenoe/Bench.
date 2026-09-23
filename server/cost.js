/**
 * Cost per machine (roadmap 115). Hours by project and month from the sizes of the tasks that were ticked
 * (effortHours, which already holds the focus timer's minutes, so nothing is counted twice), times the hourly
 * rate from Settings when one is set. A table for the Review page and a CSV the controller can open in Excel.
 *
 *   GET /api/cost?months=3       { months, byMachine: [{ project, hours: { ym: h }, total, cost }], totalHours, totalCost, hourlyRate }
 *   GET /api/cost.csv?months=3   text/csv, UTF-8 with a BOM, semicolons (Swiss Excel), months as columns
 */
import * as store from './store.js'
import * as settings from './settings.js'

const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))
const round1 = n => Math.round(n * 10) / 10
const round2 = n => Math.round(n * 100) / 100
export const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
/** The last n months as yyyy-mm, oldest first, ending with the month that holds `now`. */
export function monthsBack(n = 3, now = new Date()) {
  const out = []
  for (let i = n - 1; i >= 0; i--) out.push(ym(new Date(now.getFullYear(), now.getMonth() - i, 1)))
  return out
}
/** The month of a completion timestamp, in local time. */
const monthOf = iso => iso ? ym(new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)) : null

/**
 * Pure aggregation. Every done task with a completion time inside the window and a size counts under its
 * project ("Unassigned" when it has none). Rows sort by total hours, largest first.
 */
export function aggregate(tasks = [], { months = 3, now = new Date(), hourlyRate = 0 } = {}) {
  const cols = monthsBack(Math.max(1, Math.min(24, Number(months) || 3)), now)
  const set = new Set(cols)
  const rate = Math.max(0, Number(hourlyRate) || 0)
  const rows = new Map()
  for (const t of tasks) {
    if (!t.done) continue
    const m = monthOf(t.completedAt); if (!m || !set.has(m)) continue
    const h = Number(t.effortHours) || 0; if (h <= 0) continue
    const project = (t.project || '').trim() || 'Unassigned'
    if (!rows.has(project)) rows.set(project, { project, hours: Object.fromEntries(cols.map(c => [c, 0])), total: 0 })
    const r = rows.get(project)
    r.hours[m] = round1(r.hours[m] + h); r.total = round1(r.total + h)
  }
  const byMachine = [...rows.values()].map(r => ({ ...r, cost: rate > 0 ? round2(r.total * rate) : null }))
    .sort((a, b) => b.total - a.total || a.project.localeCompare(b.project))
  const totalHours = round1(byMachine.reduce((s, r) => s + r.total, 0))
  const byMonth = Object.fromEntries(cols.map(c => [c, round1(byMachine.reduce((s, r) => s + (r.hours[c] || 0), 0))]))
  return { months: cols, byMachine, byMonth, totalHours, totalCost: rate > 0 ? round2(totalHours * rate) : null, hourlyRate: rate }
}

/** Swiss Excel: semicolons, a decimal comma, CRLF, and a BOM so the umlauts survive a double-click. */
const cell = v => { const s = String(v ?? ''); return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const num = n => String(n).replace('.', ',')
export function toCsv(data) {
  const withCost = data.hourlyRate > 0
  const head = ['Machine', ...data.months, 'Total hours', ...(withCost ? [`Cost CHF at ${num(data.hourlyRate)}/h`] : [])]
  const lines = [head.map(cell).join(';')]
  for (const r of data.byMachine) lines.push([r.project, ...data.months.map(m => num(r.hours[m] || 0)), num(r.total), ...(withCost ? [num(r.cost)] : [])].map(cell).join(';'))
  lines.push(['Total', ...data.months.map(m => num(data.byMonth[m] || 0)), num(data.totalHours), ...(withCost ? [num(data.totalCost)] : [])].map(cell).join(';'))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export const cost = (months) => aggregate(store.allTasks(), { months, hourlyRate: settings.get().hourlyRate })

export function registerRoutes(app) {
  app.get('/api/cost', wrap((req, res) => res.json(cost(req.query.months))))
  app.get('/api/cost.csv', wrap((req, res) => {
    const data = cost(req.query.months)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="bench-cost-${data.months[0]}-to-${data.months.at(-1)}.csv"`)
    res.send(toCsv(data))
  }))
}
