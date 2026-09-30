/**
 * Project reports (roadmap 158): one page of progress to share, as black-on-white HTML that prints to A4.
 * The desktop app turns it into a PDF (electron/main.cjs, bench:save-pdf); a browser prints it with ?print=1.
 * What goes in is what a colleague needs: stage, dates, the plan and its room, open work, decisions and actions.
 * Private notes, folders and links into Bench. stay out.
 *
 *   innovationReport(d, { today, author })   pure: HTML from GET /api/portfolio/:code
 *   planReport(d, { today, author })         pure: HTML from GET /api/projects/:id
 *   portfolioReport(list, { today, author, moves, decisions })   pure: the innovation portfolio (roadmap 162)
 *   todayReport(d, { today, author, workdayHours })   pure: the day's plan for a manager (roadmap 164)
 *   GET /api/report/innovation/:code   GET /api/report/project/:id   GET /api/report/portfolio   GET /api/report/today
 */
import * as portfolio from './portfolio.js'
import * as projects from './projects.js'
import * as settings from './settings.js'
import * as store from './store.js'
import { isOff } from './workdays.js'
import { meetingsCached } from './day.js'
import { codeOf } from './codes.js'
import { busyMinutes } from './calendar.js'
import * as history from './history.js'

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
.cap { color: #555; font-size: 8.5pt; margin: 0 0 2mm; }
.stages { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1.5mm; margin: 0 0 1mm; }
.stages div { border-top: 3pt solid #ddd; padding-top: 1.5mm; color: #777; }
.stages div.on { border-color: #111; color: #111; }
.stages b { display: block; font-size: 16pt; font-weight: 650; line-height: 1.15; }
.stages span { font-size: 8.5pt; }
table.dense td, table.dense th { font-size: 9pt; }
td.nw, th.nw { white-space: nowrap; }
.note { color: #777; font-size: 8pt; margin: 1.5mm 0 0; }
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

const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t }
/** "12 days late" or "40 days of room" from a project's due date; empty without one. */
const lateOrRoom = p => p.overdue > 0 ? plural(p.overdue, 'day') + ' late' : typeof p.daysToDue === 'number' ? (p.daysToDue === 0 ? 'due today' : `${plural(p.daysToDue, 'day')} of room`) : ''
const DECISIONS_MAX = 14

/**
 * The portfolio for management (roadmap 162): one or two A4 pages with the open projects per stage, what needs
 * attention (overdue, stuck in a stage, actions left open), every open project with its stage, since when and
 * its due date, the stage moves and the Logbook decisions of the last 30 days. list is portfolio.portfolio(),
 * moves and decisions come from portfolio.summary(). Tasks' notes and entries' notes stay out.
 */
export function portfolioReport(list, { today, author = '', moves = [], decisions = [], print = false } = {}) {
  const open = list.filter(p => !p.done)
  const counts = portfolio.STAGES.map((s, i) => ({ name: s.name, n: open.filter(p => p.stage === i).length }))
  const other = open.filter(p => p.stage < 0).length
  const overdue = open.filter(p => p.overdue > 0).length
  const attention = portfolio.needsAttention(open)
  const stages = `<p class="cap">Open projects by stage</p><div class="stages">${counts.map(c => `<div class="${c.n ? 'on' : ''}"><b>${c.n}</b><span>${esc(c.name)}</span></div>`).join('')}</div>
${other ? `<p class="note">${esc(plural(other, 'project'))} in a bucket that is not one of the five stages.</p>` : ''}`
  const figs = `<div class="figs">
${fig(open.length, open.length === 1 ? 'open project' : 'open projects')}
${fig(new Set(moves.map(m => m.code)).size, 'moved stage in 30 days')}
${fig(overdue, 'past their due date', overdue ? 'late' : '')}
${fig(decisions.length, decisions.length === 1 ? 'decision in 30 days' : 'decisions in 30 days')}
</div>`
  const attentionRows = attention.map(a => `<tr><td class="nw">${esc(a.code)}</td><td>${esc(a.name)}</td><td>${a.reasons.map(r => `<span${r.kind === 'overdue' ? ' class="late"' : ''}>${esc(r.text)}</span>`).join('; ')}</td></tr>`)
  const since = p => p.stageSince ? `${p.stageSinceExact ? '' : 'by '}${fmt(p.stageSince)}` : ''
  const anyBy = open.some(p => p.stageSince && !p.stageSinceExact)
  const projectRows = open.map(p => `<tr><td class="nw">${esc(p.code)}</td><td>${esc(p.name)}</td><td>${esc(p.stageName || (p.bucket ? `"${p.bucket}"` : 'none'))}</td><td class="nw">${esc(since(p))}</td><td class="n">${esc(fmt(p.due))}</td><td class="n${p.overdue > 0 ? ' late' : ''}">${esc(lateOrRoom(p))}</td><td class="n">${p.openActions || ''}</td></tr>`)
  const moveRows = moves.map(m => `<tr><td class="nw">${esc(fmt(m.date))}</td><td class="nw">${esc(m.code)}</td><td>${esc(m.name)}</td><td>${esc(m.from)}</td><td>${esc(m.to)}</td></tr>`)
  const decisionRows = decisions.slice(0, DECISIONS_MAX).map(d => `<tr><td class="nw">${esc(fmt(d.date))}</td><td class="nw">${esc(d.code)}</td><td>${esc(clip(d.text, 180))}</td><td>${esc(clip(d.entry, 40))}</td></tr>`)
  const body = `${stages}${figs}
<h2>Needs attention</h2>${table(['Code', 'Project', 'Why'], attentionRows, `Nothing stands out: no project is past its due date, in one stage for ${portfolio.STUCK_DAYS} days or more, or has actions open longer than ${portfolio.STALE_ACTION_DAYS} days.`)}
<h2>Open projects</h2>${table(['Code', 'Project', 'Stage', { t: 'Stage since' }, { t: 'Due', n: true }, { t: 'Late or room', n: true }, { t: 'Actions', n: true }], projectRows, 'No open innovation project. A Planner card whose title starts with an I-code becomes one.').replace('<table>', '<table class="dense">')}
${anyBy ? '<p class="note">"by" is the day Bench. first saw the card in that stage; it may have been there longer.</p>' : ''}
<h2>Moved this month</h2>${table(['Date', 'Code', 'Project', 'From', 'To'], moveRows, 'No project changed stage in the last 30 days.').replace('<table>', '<table class="dense">')}
<h2>Decisions this month</h2>${table(['Date', 'Code', 'Decision', 'Meeting'], decisionRows, 'No Logbook decision in the last 30 days names an I-code.').replace('<table>', '<table class="dense">')}
${decisions.length > DECISIONS_MAX ? `<p class="note">And ${esc(plural(decisions.length - DECISIONS_MAX, 'more decision'))} in the Logbook.</p>` : ''}`
  return page({ title: 'Innovation portfolio', kicker: 'Management report', meta: [author ? `Prepared by ${author}` : null, fmt(today)].filter(Boolean).join(' · '), body, today, print })
}

// ── Today, for a manager (roadmap 164) ─────────────────────────────────
const SOURCE = { planner: 'Planner', issues: 'Issues', qms: 'QMS', bom: 'BOM' }
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const hrs = h => `${Math.round(h * 10) / 10} h`
const dayOf = iso => String(iso || '').slice(0, 10)
/**
 * What a task belongs to: its project field, else its Planner plan. An innovation card already carries its code in
 * the title, so its stage says more ("Innovation, Development").
 */
const partOf = t => {
  if (t.project) return t.project
  if (t.source === 'planner' && codeOf(t.title)) { const i = portfolio.stageOf(t.bucketName); return i >= 0 ? `Innovation, ${portfolio.STAGES[i].name}` : 'Innovation' }
  return t.planTitle || ''
}
const progress = t => { const c = t.checklist || []; return c.length ? `${c.filter(x => x.done).length} of ${plural(c.length, 'step')}` : '' }

/** The working day before `today` (weekends, holidays and days off skipped), as yyyy-mm-dd. */
export function previousWorkday(today, off = isOff) {
  const d = new Date(`${today}T12:00:00`)
  for (let i = 0; i < 14; i++) { d.setDate(d.getDate() - 1); const iso = projects.isoOf(d); if (!off(iso)) return iso }
  return null
}

/**
 * The day's plan on one page, for the person Noël reports to: what is on Today and why it matters (project,
 * where it came from, priority, due date, size, steps done), the hours against the workday, the meetings
 * (subject and time only), what waits on other people, and what was finished on the last working day.
 * Notes, links and folders stay out. `d` is { tasks, meetings, yesterday, doneIds }: yesterday is a date, doneIds the
 * tasks finished that day (ticked here, or marked done in their tool). A card that arrived already done in a sync
 * was not finished that day, so it is not in doneIds; without doneIds, completedAt decides.
 */
export function todayReport(d, { today, author = '', workdayHours = 8.4, print = false } = {}) {
  const tasks = d.tasks || []
  const onToday = tasks.filter(t => t.lane === 'today' && (!t.done || dayOf(t.completedAt) === today))
  const open = onToday.filter(t => !t.done), doneToday = onToday.filter(t => t.done)
  const byPrio = (a, b) => (a.done - b.done) || ((a.priority || 9) - (b.priority || 9)) || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))
  const meetings = (d.meetings || []).filter(m => !m.allDay && m.start).sort((a, b) => a.start.localeCompare(b.start))
  // time in meetings with overlaps merged, and what is left of the workday (roadmap 166); a task's size is its
  // whole remaining effort, not today's share, so sizes are shown per task and never summed against the day
  const inMeetings = busyMinutes(meetings) / 60
  const free = Math.max(0, workdayHours - inMeetings)
  const waiting = tasks.filter(t => !t.done && t.lane === 'waiting')
  const finished = !d.yesterday ? [] : tasks.filter(t => t.done && (d.doneIds ? d.doneIds.has(t.id) : dayOf(t.completedAt) === d.yesterday))

  const figs = `<div class="figs">
${fig(`${open.length}`, open.length === 1 ? 'task on today' : 'tasks on today')}
${fig(hrs(free), meetings.length ? 'free after meetings' : 'free, no meetings')}
${fig(meetings.length ? hrs(inMeetings) : 'none', meetings.length ? `in ${plural(meetings.length, 'meeting')}` : 'meetings')}
${fig(`${finished.length}`, d.yesterday ? `done on ${DAYS[new Date(`${d.yesterday}T12:00:00`).getDay()]}` : 'done last workday')}
</div>`
  const due = t => { const x = dayOf(t.dueDate); if (!x) return ''; return x < today ? `<span class="late">${esc(fmt(x))}</span>` : x === today ? 'today' : esc(fmt(x)) }
  const anySize = onToday.some(t => Number(t.effortHours) > 0)   // no size anywhere: no Size column
  const rows = [...open, ...doneToday].sort(byPrio).map(t => `<tr${t.done ? ' class="done"' : ''}><td>${esc(t.title)}${t.done ? ' (done)' : ''}</td><td>${esc(partOf(t))}</td><td>${esc(SOURCE[t.source] || 'Own')}</td><td class="n">${t.priority ? `P${t.priority}` : ''}</td><td class="n">${due(t)}</td>${anySize ? `<td class="n">${Number(t.effortHours) > 0 ? esc(hrs(Number(t.effortHours))) : ''}</td>` : ''}<td class="n">${esc(progress(t))}</td></tr>`)
  const meetingRows = meetings.map(m => `<tr><td class="nw">${esc(m.start)} to ${esc(m.end || '')}</td><td>${esc(m.subject || 'Meeting')}</td></tr>`)
  const waitRows = waiting.map(t => `<tr><td>${esc(t.title)}</td><td>${esc(t.waitingOn || '')}</td><td class="n">${esc(fmt(t.waitingSince))}</td></tr>`)
  const doneRows = finished.map(t => `<tr><td>${esc(t.title)}</td><td>${esc(partOf(t))}</td></tr>`)
  const dayName = DAYS[new Date(`${today}T12:00:00`).getDay()]
  const body = `${figs}
<h2>On today</h2>${table(['Task', 'Project', 'From', { t: 'Priority', n: true }, { t: 'Due', n: true }, ...(anySize ? [{ t: 'Effort', n: true }] : []), { t: 'Progress', n: true }], rows, 'Nothing on Today yet.')}
<p class="note">${esc(`${hrs(free)} free in a ${hrs(workdayHours)} workday${meetings.length ? ` after ${hrs(inMeetings)} of meetings (overlaps counted once)` : ''}.${anySize ? ' Effort is the whole task, not today\'s share.' : ''}`)}</p>
<h2>Meetings</h2>${table(['Time', 'Meeting'], meetingRows, 'No meetings on the calendar today.')}
${waitRows.length ? `<h2>Waiting on others</h2>${table(['Task', 'With', { t: 'Since', n: true }], waitRows, '')}` : ''}
<h2>Done ${d.yesterday ? `on ${esc(DAYS[new Date(`${d.yesterday}T12:00:00`).getDay()])}, ${esc(fmt(d.yesterday))}` : 'on the last workday'}</h2>${table(['Task', 'Project'], doneRows, 'Nothing ticked off that day.')}`
  return page({ title: `Today, ${dayName} ${fmt(today)}`, kicker: 'Daily plan', meta: [author || null, `${hrs(workdayHours)} workday`].filter(Boolean).join(' · '), body, today, print })
}

/** Tasks finished on `day` (local date): a change to done that day, by hand or from the task's own tool. */
export function finishedOn(day, entries = history.list(history.CAP)) {
  const ids = new Set()
  if (!day) return ids
  for (const e of entries) {
    if (e.undoneAt || !['changed', 'synced'].includes(e.kind)) continue
    const at = new Date(e.at); if (projects.isoOf(at) !== day) continue
    // from not done to done; a card that arrived already done has no before (its change starts from nothing)
    if ((e.changes || []).some(c => c.field === 'done' && c.to === true && c.from === false)) ids.add(e.taskId)
  }
  return ids
}

const todayIso = () => projects.isoOf(new Date())
const author = () => { try { return String(settings.get().name || '').trim() } catch { return '' } }
const send = (res, html) => res.set('Cache-Control', 'no-store').type('html').send(html)
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))

export function registerRoutes(app) {
  app.get('/api/report/today', wrap(async (req, res) => {
    const today = todayIso()
    const meetings = await meetingsCached().catch(() => [])
    const s = settings.get()
    const yesterday = previousWorkday(today)
    send(res, todayReport({ tasks: store.allTasks(), meetings, yesterday, doneIds: finishedOn(yesterday) }, { today, author: author(), workdayHours: Number(s.workdayHours) || 8.4, print: req.query.print === '1' }))
  }))
  app.get('/api/report/portfolio', wrap((req, res) => {
    const today = todayIso(), { projects: list, summary } = portfolio.overview(today)
    send(res, portfolioReport(list, { today, author: author(), moves: summary.moved, decisions: summary.decisions, print: req.query.print === '1' }))
  }))
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
