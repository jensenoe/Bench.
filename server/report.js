/**
 * Project reports (roadmap 158): one page of progress to share, as black-on-white HTML that prints to A4.
 * The desktop app turns it into a PDF (electron/main.cjs, bench:save-pdf); a browser prints it with ?print=1.
 * What goes in is what a colleague needs: stage, dates, the plan and its room, open work, decisions and actions.
 * Private notes, folders and links into Bench. stay out.
 *
 *   innovationReport(d, { today, author })   pure: HTML from GET /api/portfolio/:code
 *   planReport(d, { today, author })         pure: HTML from GET /api/projects/:id
 *   GET /api/report/innovation/:code   GET /api/report/project/:id
 */
import * as portfolio from './portfolio.js'
import * as projects from './projects.js'
import * as settings from './settings.js'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LANE = { today: 'Today', active: 'Active', waiting: 'Waiting', innovation: 'Innovation', parked: 'Parked' }
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const fmt = iso => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : '' }
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const room = n => n === null || n === undefined ? 'not known' : n < 0 ? `${plural(-n, 'working day')} behind` : `${plural(n, 'working day')} of room`
/** A file name from a title: letters, digits, spaces and dashes. */
export const fileName = (title, today) => `${String(title).replace(/[^\p{L}\p{N} _-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Project'} - ${today}.pdf`

const CSS = `
@page { size: A4; margin: 16mm 16mm 18mm; }
* { box-sizing: border-box; }
html { background: #fff; }
body { margin: 0 auto; max-width: 180mm; padding: 12mm 0; color: #111; background: #fff; font: 10pt/1.45 "Segoe UI", "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print { body { padding: 0; max-width: none; } }
header { border-bottom: 1.5pt solid #111; padding-bottom: 5mm; margin-bottom: 6mm; }
.kicker { font-size: 9pt; letter-spacing: .06em; text-transform: uppercase; color: #555; margin: 0; }
h1 { font-size: 22pt; line-height: 1.1; margin: 2mm 0 1mm; font-weight: 650; }
.meta { color: #555; margin: 0; }
h2 { font-size: 12pt; margin: 7mm 0 2mm; font-weight: 650; break-after: avoid; }
.figs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; margin: 5mm 0 2mm; }
.fig b { display: block; font-size: 14pt; font-weight: 650; }
.fig span { color: #555; font-size: 8.5pt; }
.late { color: #b3261e; }
.track { display: grid; gap: 1.5mm; margin-top: 3mm; }
.step { border-top: 3pt solid #ddd; padding-top: 1.5mm; font-size: 8.5pt; color: #777; }
.step.done { border-color: #111; color: #111; }
.step.now { border-color: #111; color: #111; font-weight: 650; }
table { width: 100%; border-collapse: collapse; margin-top: 1mm; }
th { text-align: left; font-size: 8.5pt; font-weight: 600; color: #555; border-bottom: .8pt solid #111; padding: 1.2mm 2mm 1.2mm 0; }
td { border-bottom: .5pt solid #ccc; padding: 1.6mm 2mm 1.6mm 0; vertical-align: top; }
tr { break-inside: avoid; }
td.n, th.n { text-align: right; white-space: nowrap; }
.done td { color: #777; }
.none { color: #777; margin: 1mm 0; }
footer { margin-top: 9mm; padding-top: 2mm; border-top: .5pt solid #ccc; color: #777; font-size: 8pt; }
`
function page({ title, kicker, meta, body, today, print }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head><body>
<header><p class="kicker">${esc(kicker)}</p><h1>${esc(title)}</h1><p class="meta">${esc(meta)}</p></header>
${body}
<footer>Report of ${esc(fmt(today))}. Made with Bench. from Planner, the board and the Logbook.</footer>
${print ? '<script>addEventListener("load", () => setTimeout(() => print(), 200))</script>' : ''}
</body></html>`
}
const table = (head, rows, empty) => rows.length
  ? `<table><thead><tr>${head.map(h => `<th${h.n ? ' class="n"' : ''}>${esc(h.t ?? h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`
  : `<p class="none">${esc(empty)}</p>`
const fig = (value, label, cls = '') => `<div class="fig"><b class="${cls}">${esc(value)}</b><span>${esc(label)}</span></div>`

/** The phases of a plan as a table: dates, tasks done of all, and where today falls. */
function phaseRows(phases, today) {
  return phases.map(ph => {
    const tasks = ph.tasks || [], done = tasks.filter(t => t.done).length
    const state = ph.end && ph.end < today ? 'past' : ph.start && ph.start <= today ? 'now' : 'ahead'
    return `<tr${state === 'past' && done === tasks.length ? ' class="done"' : ''}><td>${esc(ph.name)}${state === 'now' ? ' (now)' : ''}</td><td>${esc(fmt(ph.start))}</td><td>${esc(fmt(ph.end))}</td><td class="n">${tasks.length ? `${done} of ${tasks.length}` : ''}</td></tr>`
  })
}

export function innovationReport(d, { today, author = '', plan = null, print = false } = {}) {
  const { project: p, stages, tasks, entries, actions } = d
  const open = tasks.filter(t => !t.done)
  const track = `<div class="track" style="grid-template-columns: repeat(${stages.length}, 1fr)">${stages.map((s, i) =>
    `<div class="step${i < p.stage ? ' done' : i === p.stage ? ' now' : ''}">${esc(s.name)}</div>`).join('')}</div>`
  const figs = `<div class="figs">
${fig(p.stageName || 'not known', p.stage >= 0 ? `stage ${p.stage + 1} of ${stages.length}` : `bucket "${p.bucket || 'none'}"`)}
${fig(p.done ? 'Done' : p.due ? fmt(p.due) : 'none', p.done ? 'in Planner' : p.overdue ? `due, ${plural(p.overdue, 'day')} over` : 'due in Planner', p.overdue ? 'late' : '')}
${fig(`${tasks.length - open.length} of ${tasks.length}`, 'tasks done')}
${fig(actions.length, actions.length === 1 ? 'open action' : 'open actions')}
</div>`
  const planPart = plan ? `<h2>Plan to ${esc(plan.project.deadlineLabel || 'the deadline')}, ${esc(fmt(plan.project.deadline))}</h2>
<p class="meta">${esc(room(plan.slack?.slack))}.</p>
${table(['Phase', 'Start', 'End', { t: 'Tasks', n: true }], phaseRows(plan.phases, today), 'No phases yet.')}` : ''
  const taskRows = [...open, ...tasks.filter(t => t.done)].map(t => `<tr${t.done ? ' class="done"' : ''}><td>${esc(t.title)}</td><td>${esc(t.done ? 'done' : LANE[t.lane] || t.lane)}</td><td class="n">${esc(fmt(t.due))}</td></tr>`)
  const actionRows = actions.map(a => `<tr><td>${esc(a.text)}</td><td>${esc(a.owner || '')}</td><td class="n">${esc(fmt(a.due))}</td></tr>`)
  const decided = entries.filter(e => e.decisions?.length)
  const decisionRows = decided.flatMap(e => e.decisions.map(x => `<tr><td class="n" style="text-align:left">${esc(fmt(e.date))}</td><td>${esc(x)}</td><td>${esc(e.title)}</td></tr>`))
  const body = `${track}${figs}${planPart}
<h2>Tasks</h2>${table(['Task', 'Status', { t: 'Due', n: true }], taskRows, `No task names ${p.code} yet.`)}
<h2>Open actions</h2>${table(['Action', 'Owner', { t: 'Due', n: true }], actionRows, 'None open.')}
<h2>Decisions</h2>${table(['Date', 'Decision', 'Meeting'], decisionRows, 'None recorded in the Logbook.')}`
  return page({ title: `${p.code} ${p.name}`, kicker: 'Innovation project', meta: [p.plan ? `${p.plan} in Planner` : null, author ? `Prepared by ${author}` : null, fmt(today)].filter(Boolean).join(' · '), body, today, print })
}

export function planReport(d, { today, author = '', print = false } = {}) {
  const { project: p, phases, unassigned = [], orders = [], slack, forecast } = d
  const all = [...phases.flatMap(ph => ph.tasks || []), ...unassigned]
  const done = all.filter(t => t.done).length
  const current = phases.find(ph => ph.start && ph.end && ph.start <= today && today <= ph.end)
  const s = Math.min(...[slack?.slack, forecast?.slack].filter(x => typeof x === 'number'))
  const figs = `<div class="figs">
${fig(p.deadline ? fmt(p.deadline) : 'none', p.deadlineLabel || 'deadline')}
${fig(Number.isFinite(s) ? (s < 0 ? `${-s} behind` : `${s}`) : 'not known', Number.isFinite(s) ? (s < 0 ? 'working days behind' : 'working days of room') : 'room', Number.isFinite(s) && s < 0 ? 'late' : '')}
${fig(current ? current.name : 'none', 'phase now')}
${fig(`${done} of ${all.length}`, 'tasks done')}
</div>`
  const phaseName = id => phases.find(x => x.id === id)?.name || ''
  const taskRows = phases.flatMap(ph => (ph.tasks || []).map(t => [ph.name, t])).concat(unassigned.map(t => ['No phase', t]))
    .sort((a, b) => a[1].done - b[1].done)
    .map(([ph, t]) => `<tr${t.done ? ' class="done"' : ''}><td>${esc(t.title)}</td><td>${esc(ph)}</td><td>${esc(t.done ? 'done' : t.waitingOn ? `with ${t.waitingOn}` : LANE[t.lane] || t.lane)}</td><td class="n">${esc(fmt(t.dueDate))}</td></tr>`)
  const orderRows = orders.map(o => `<tr><td>${esc(o.title)}</td><td>${esc(o.supplier)}</td><td class="n">${esc(fmt(o.orderBy))}</td><td class="n">${esc(fmt(o.needBy))}</td></tr>`)
  const lateRows = (slack?.late || []).map(t => `<tr><td>${esc(t.title)}</td><td>${esc(phaseName(t.phase))}</td><td class="n late">${esc(fmt(t.dueDate))}</td></tr>`)
  const body = `${figs}
${p.goal ? `<h2>Goal</h2><p>${esc(p.goal)}</p>` : ''}
<h2>Plan</h2>${table(['Phase', 'Start', 'End', { t: 'Tasks', n: true }], phaseRows(phases, today), 'No phases yet.')}
${lateRows.length ? `<h2>Running late</h2>${table(['Task', 'Phase', { t: 'Due', n: true }], lateRows, '')}` : ''}
<h2>Tasks</h2>${table(['Task', 'Phase', 'Status', { t: 'Due', n: true }], taskRows, 'No tasks on this project yet.')}
${orderRows.length ? `<h2>Parts to order</h2>${table(['Part', 'Supplier', { t: 'Order by', n: true }, { t: 'Needed by', n: true }], orderRows, '')}` : ''}`
  return page({ title: p.name, kicker: 'Project plan', meta: [p.machine && p.machine !== p.name ? p.machine : null, author ? `Prepared by ${author}` : null, fmt(today)].filter(Boolean).join(' · '), body, today, print })
}

const todayIso = () => projects.isoOf(new Date())
const author = () => { try { return String(settings.get().name || '').trim() } catch { return '' } }
const send = (res, html) => res.set('Cache-Control', 'no-store').type('html').send(html)
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))

export function registerRoutes(app) {
  app.get('/api/report/innovation/:code', wrap((req, res) => {
    const today = todayIso(), d = portfolio.detail(req.params.code, today)
    if (!d) return res.status(404).json({ error: 'not found' })
    const plan = d.plan ? projects.detail(d.plan.id, today) : null
    send(res, innovationReport(d, { today, author: author(), plan, print: req.query.print === '1' }))
  }))
  app.get('/api/report/project/:id', wrap((req, res) => {
    const today = todayIso(), d = projects.detail(req.params.id, today)
    if (!d) return res.status(404).json({ error: 'not found' })
    send(res, planReport(d, { today, author: author(), print: req.query.print === '1' }))
  }))
}
