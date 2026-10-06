/**
 * The RAIDD log of a project (roadmap 168): Risks, Assumptions, Issues, Dependencies and Decisions, kept per
 * project in the shared data folder (raidd.json, or a table when BENCH_STORAGE is sqlite, see db.js), so the
 * team on the same folder sees the same log. A project is a key: the I-code for an innovation project
 * ("I-1050") and "plan:<id>" for a plan from Projects.
 *
 * Decisions taken in a meeting are not typed twice: GET also returns the decisions of every Logbook entry that
 * names the project, read-only, with a link back to the entry. Tasks are never touched.
 *
 *   riskLevel(score)            low, medium, high or critical from likelihood times impact
 *   summary(entries, today)     counts per type, and what needs a look
 *   matrix(entries)             the 5 by 5 grid of open risks, likelihood by impact
 *   listFor(key, { today })     { entries, summary, matrix } for a project, Logbook decisions included
 *   raiddReportHtml(entries, { today, esc, fmt })   the section for the A4 project report
 *
 *   GET /api/raidd?project=KEY   POST /api/raidd   PATCH /api/raidd/:id   DELETE /api/raidd/:id
 *
 * The change feed (history.js) is left out on purpose: its entries are tasks and its undo goes through the
 * task store. A deleted entry comes back through POST with its old id (the toast's Undo).
 */
import crypto from 'node:crypto'
import * as db from './db.js'
import * as settings from './settings.js'
import * as notes from './notes.js'
import * as projects from './projects.js'
import { backupOnce } from './backup.js'
import { codeOf, mentions } from './codes.js'

const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status })
const now = () => new Date().toISOString()
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// ── the shape ─────────────────────────────────────────────────────────
export const TYPES = ['risk', 'assumption', 'issue', 'dependency', 'decision']
export const STATUSES = {
  risk: ['open', 'mitigating', 'closed'],
  assumption: ['open', 'validated', 'invalid'],
  issue: ['open', 'in progress', 'resolved'],
  dependency: ['open', 'at risk', 'met'],
  decision: ['made']
}
/** The statuses that end an entry's life: everything else counts as open. A decision is never open. */
export const CLOSED = { risk: ['closed'], assumption: ['validated', 'invalid'], issue: ['resolved'], dependency: ['met'], decision: ['made'] }
export const SEVERITIES = ['low', 'medium', 'high']
export const DIRECTIONS = ['in', 'out']
export const MAX = { title: 160, detail: 2000, owner: 80, long: 1000, on: 120, perProject: 1000 }
export const isOpen = e => Boolean(e) && TYPES.includes(e.type) && !CLOSED[e.type].includes(e.status)

/** "I-1050" or "plan:<id>", normalised, or null when the key names neither. */
export function projectKey(v) {
  const s = String(v ?? '').trim()
  if (/^I-\d{3,5}$/i.test(s)) return codeOf(s)
  const m = /^plan:([\w-]{1,80})$/.exec(s)
  return m ? `plan:${m[1]}` : null
}

const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const text = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max)
const date = v => {
  const s = String(v ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T12:00:00Z')
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s
}
/** A 1 to 5 rating: clamped, rounded, 3 when nothing usable was given. */
const scale = (v, fallback = 3) => {
  if (v === null || v === undefined || String(v).trim() === '') return fallback
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : fallback
}
const oneOf = (v, list, fallback) => { const s = String(v ?? '').trim().toLowerCase(); return list.includes(s) ? s : fallback }
const tri = v => v === true || v === 'true' ? true : v === false || v === 'false' ? false : null

/** Fields every entry has, and the ones each type adds. */
const COMMON = ['title', 'detail', 'owner', 'status']
const EXTRA = {
  risk: ['likelihood', 'impact', 'mitigation', 'reviewOn'],
  assumption: ['validateBy', 'validated'],
  issue: ['severity', 'due', 'resolution'],
  dependency: ['on', 'needBy', 'direction'],
  decision: ['decidedOn', 'decidedBy', 'rationale']
}
export const FIELDS = Object.fromEntries(TYPES.map(t => [t, [...COMMON, ...EXTRA[t]]]))

/**
 * One entry, cleaned: the fields of its type, every string trimmed and capped, numbers clamped, dates as
 * yyyy-mm-dd or null, a status its type knows. `input` overrides `base` field by field. Pure.
 */
export function clean(base, input = {}) {
  const type = base.type
  const pick = k => (k in input ? input[k] : base[k])
  const out = {
    id: base.id, project: base.project, type,
    title: str(pick('title'), MAX.title),
    detail: text(pick('detail'), MAX.detail),
    owner: str(pick('owner'), MAX.owner),
    status: oneOf(pick('status'), STATUSES[type], STATUSES[type][0])
  }
  if (type === 'risk') {
    out.likelihood = scale(pick('likelihood'))
    out.impact = scale(pick('impact'))
    out.score = out.likelihood * out.impact
    out.mitigation = text(pick('mitigation'), MAX.long)
    out.reviewOn = date(pick('reviewOn'))
  } else if (type === 'assumption') {
    // status and validated say the same thing; whichever the input carries wins, the status first
    if ('status' in input) out.validated = out.status === 'validated' ? true : out.status === 'invalid' ? false : null
    else {
      out.validated = tri(pick('validated'))
      out.status = out.validated === true ? 'validated' : out.validated === false ? 'invalid' : 'open'
    }
    out.validateBy = date(pick('validateBy'))
  } else if (type === 'issue') {
    out.severity = oneOf(pick('severity'), SEVERITIES, 'medium')
    out.due = date(pick('due'))
    out.resolution = text(pick('resolution'), MAX.long)
  } else if (type === 'dependency') {
    out.on = str(pick('on'), MAX.on)
    out.needBy = date(pick('needBy'))
    out.direction = oneOf(pick('direction'), DIRECTIONS, 'in')
  } else if (type === 'decision') {
    out.decidedOn = date(pick('decidedOn'))
    out.decidedBy = str(pick('decidedBy'), MAX.owner)
    out.rationale = text(pick('rationale'), MAX.long)
  }
  out.createdAt = base.createdAt
  out.updatedAt = base.updatedAt
  out.by = base.by ?? null
  if (base.updatedBy) out.updatedBy = base.updatedBy
  return out
}

// ── pure helpers ──────────────────────────────────────────────────────
/** Likelihood times impact as a word: 1 to 4 low, 5 to 9 medium, 10 to 16 high, 20 to 25 critical. */
export function riskLevel(score) {
  const n = Number(score)
  if (!Number.isFinite(n) || n < 1) return null
  return n >= 20 ? 'critical' : n >= 10 ? 'high' : n >= 5 ? 'medium' : 'low'
}

/** The date that matters for an entry, by type: review, validate-by, due, need-by or decided on. */
export const keyDate = e => e?.type === 'risk' ? e.reviewOn : e?.type === 'assumption' ? e.validateBy : e?.type === 'issue' ? e.due
  : e?.type === 'dependency' ? e.needBy : e?.type === 'decision' ? e.decidedOn : null

/** Is the entry's date behind it while it is still open? A decision is never late. */
export function isLate(e, today = isoToday()) {
  if (!isOpen(e)) return false
  const d = keyDate(e)
  return Boolean(d) && d < today
}

/**
 * What the counters and the report say: per type the total and the open ones, and the lists of ids that need
 * a look. Open high or critical risks; open issues past due; dependencies at risk or past their need-by and not
 * met; assumptions past validate-by and not validated; open risks past their review date.
 */
export function summary(entries = [], today = isoToday()) {
  const list = (Array.isArray(entries) ? entries : []).filter(e => e && TYPES.includes(e.type))
  const counts = Object.fromEntries(TYPES.map(t => [t, { total: 0, open: 0 }]))
  for (const e of list) { counts[e.type].total++; if (isOpen(e)) counts[e.type].open++ }
  const open = list.filter(isOpen)
  const ids = f => open.filter(f).map(e => e.id)
  const highRisks = ids(e => e.type === 'risk' && ['high', 'critical'].includes(riskLevel(e.score ?? e.likelihood * e.impact)))
  const overdueIssues = ids(e => e.type === 'issue' && e.due && e.due < today)
  const dependenciesAtRisk = ids(e => e.type === 'dependency' && (e.status === 'at risk' || (e.needBy && e.needBy < today)))
  const assumptionsDue = ids(e => e.type === 'assumption' && e.validated !== true && e.validateBy && e.validateBy < today)
  const reviewsDue = ids(e => e.type === 'risk' && e.reviewOn && e.reviewOn < today)
  const attention = new Set([...highRisks, ...overdueIssues, ...dependenciesAtRisk, ...assumptionsDue, ...reviewsDue]).size
  return { today, counts, open: open.length, highRisks, overdueIssues, dependenciesAtRisk, assumptionsDue, reviewsDue, attention }
}

/** The open risks on a 5 by 5 grid: grid[likelihood - 1][impact - 1] holds the ids in that cell. */
export function matrix(entries = []) {
  const grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => []))
  for (const e of entries || []) {
    if (e?.type !== 'risk' || !isOpen(e)) continue
    const l = scale(e.likelihood), i = scale(e.impact)
    grid[l - 1][i - 1].push(e.id)
  }
  return grid
}

const SEVERITY_WEIGHT = { high: 18, medium: 10, low: 4 }
/** How hard an entry presses, for the default order: a risk by its score, the rest by what they are. Closed ones weigh nothing. */
export function weight(e, today = isoToday()) {
  if (!isOpen(e)) return -1
  const late = isLate(e, today) ? 6 : 0
  if (e.type === 'risk') return (e.score || 0) + late
  if (e.type === 'issue') return (SEVERITY_WEIGHT[e.severity] || 10) + late
  if (e.type === 'dependency') return (e.status === 'at risk' ? 14 : 7) + late
  if (e.type === 'assumption') return 6 + late
  return 0
}
/** Most severe first, then the newest. */
export const bySeverity = (today = isoToday()) => (a, b) => weight(b, today) - weight(a, today)
  || String(b.createdAt || b.decidedOn || '').localeCompare(String(a.createdAt || a.decidedOn || ''))

// ── storage ───────────────────────────────────────────────────────────
// Read through db.js like projects.js and notes.js. The folder may be shared: when another Bench wrote the
// collection since the last read, the next read takes it from disk again.
const col = () => db.collection('raidd')
let cache = null, seen = null
const stampOf = c => { try { return c.stamp ? c.stamp() : String(c.mtime()) } catch { return null } }
function load() {
  const c = col()
  const stamp = stampOf(c)
  if (cache && stamp === seen) return cache
  try { cache = c.exists() ? c.read() : { items: [] } } catch { cache = cache || { items: [] } }
  if (!Array.isArray(cache.items)) cache.items = []
  seen = stamp
  return cache
}
function save() {
  const c = col()
  if (c.file) backupOnce(c.file)
  c.write(cache)
  seen = stampOf(c)
}
/** Drop the cache so the next read comes from disk (after a backup restore). */
export function reload() { cache = null; seen = null }

const me = () => { try { return settings.get().name || null } catch { return null } }

/** Every stored entry of a project, the Logbook's decisions left out. */
export const stored = key => load().items.filter(e => e.project === key)

export function create(input = {}) {
  const project = projectKey(input.project)
  if (!project) throw bad('Name the project: an I-code such as I-1050, or plan:<id>.')
  const type = String(input.type ?? '').trim().toLowerCase()
  if (!TYPES.includes(type)) throw bad(`Unknown type. Use one of ${TYPES.join(', ')}.`)
  const d = load()
  if (d.items.filter(e => e.project === project).length >= MAX.perProject) throw bad(`This project holds ${MAX.perProject} entries already.`, 409)
  // the toast's Undo brings a deleted entry back with its id and its dates
  const restoreId = typeof input.id === 'string' && /^[\w-]{8,64}$/.test(input.id) && !d.items.some(e => e.id === input.id) ? input.id : null
  const created = restoreId && !Number.isNaN(Date.parse(input.createdAt)) ? new Date(input.createdAt).toISOString() : now()
  const by = restoreId && input.by ? str(input.by, MAX.owner) : me()
  const e = clean({ id: restoreId || crypto.randomUUID(), project, type, createdAt: created, updatedAt: now(), by }, input)
  if (type === 'decision' && !e.decidedOn && !('decidedOn' in input)) e.decidedOn = isoToday()
  if (!e.title) throw bad('Give it a title.')
  d.items.push(e); save()
  return e
}

export function update(id, patch = {}) {
  if (String(id).startsWith('logbook:')) throw bad('That decision lives in the Logbook. Change it there.')
  const d = load()
  const i = d.items.findIndex(e => e.id === id)
  if (i < 0) return null
  const before = d.items[i]
  const { id: _i, project: _p, type: _t, createdAt: _c, by: _b, score: _s, ...rest } = patch || {}   // these are not for a patch
  const e = clean({ ...before, updatedAt: now(), updatedBy: me() }, rest)
  if (!e.title) throw bad('Give it a title.')
  d.items[i] = e; save()
  return e
}

export function remove(id) {
  const d = load()
  const i = d.items.findIndex(e => e.id === id)
  if (i < 0) return null
  const [gone] = d.items.splice(i, 1); save()
  return gone
}

// ── the Logbook's decisions ───────────────────────────────────────────
const phrase = (hay, needle) => Boolean(needle) && String(hay || '').toLowerCase().includes(needle.toLowerCase())
/**
 * Does a Logbook entry belong to the project? An I-code is matched as portfolio.js does: anywhere in the
 * title, the project, the tags or the notes. A plan by the I-code in its machine or name when it has one,
 * else by its machine or name as the entry's project or a tag, or in the entry's title.
 */
export function entryNames(entry, key, plan = null) {
  const code = codeOf(key) && key.startsWith('I-') ? key : codeOf(plan?.machine) || codeOf(plan?.name)
  if (code) return mentions([entry.title, entry.project, ...(entry.tags || []), entry.notes].join(' '), code)
  if (!plan) return false
  const names = [plan.machine, plan.name].map(s => String(s || '').trim()).filter(Boolean)
  const eq = (a, b) => String(a || '').trim().toLowerCase() === b.toLowerCase()
  return names.some(n => eq(entry.project, n) || (entry.tags || []).some(t => eq(t, n)) || phrase(entry.title, n))
}
/** The decisions of the Logbook entries that name the project, read-only, newest first. Pure. */
export function logbookDecisions(key, entries = [], plan = null) {
  return (entries || []).filter(e => e && Array.isArray(e.decisions) && e.decisions.length && entryNames(e, key, plan))
    .flatMap(e => e.decisions.map((text, n) => ({
      id: `logbook:${e.id}:${n}`, project: key, type: 'decision', status: 'made', title: str(text, MAX.title * 4),
      decidedOn: date(e.date), source: 'logbook', readOnly: true, entryId: e.id, entryTitle: e.title || ''
    })))
    .sort((a, b) => String(b.decidedOn || '').localeCompare(String(a.decidedOn || '')))
}

/** A project's log: its own entries and the Logbook's decisions, most severe and newest first, with the summary and the grid. */
export function listFor(key, { today = isoToday() } = {}) {
  const k = projectKey(key)
  if (!k) throw bad('Name the project: an I-code such as I-1050, or plan:<id>.')
  let entries = [], plan = null
  try { entries = notes.listEntries() } catch { entries = [] }
  if (k.startsWith('plan:')) { try { plan = projects.list().find(p => p.id === k.slice(5)) || null } catch { plan = null } }
  const all = [...stored(k), ...logbookDecisions(k, entries, plan)].sort(bySeverity(today))
  return { project: k, entries: all, summary: summary(all, today), matrix: matrix(all) }
}

// ── the report section ────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const escDefault = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const fmtDefault = iso => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : '' }
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const H3 = 'font-size:10.5pt;font-weight:650;margin:4mm 0 1mm;break-after:avoid'

/**
 * The RAIDD section of the A4 project report (report.js): a headline, one line of summary, the open risks by
 * score, then open issues, open dependencies, assumptions not yet validated and the last ten decisions, each a
 * table or one "None." line. Uses the report's own esc and fmt and its classes (table, .none, .late, .note).
 */
export function raiddReportHtml(entries = [], { today = isoToday(), esc = escDefault, fmt = fmtDefault } = {}) {
  const list = (entries || []).filter(e => e && TYPES.includes(e.type))
  const s = summary(list, today)
  const open = t => list.filter(e => e.type === t && isOpen(e))
  const late = (iso, isLateNow) => iso ? (isLateNow ? `<span class="late">${esc(fmt(iso))}</span>` : esc(fmt(iso))) : ''
  const table = (head, rows) => rows.length
    ? `<table class="dense"><thead><tr>${head.map(h => `<th${h.n ? ' class="n"' : h.nw ? ' class="nw"' : ''}>${esc(h.t ?? h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`
    : '<p class="none">None.</p>'
  const sub = t => `<h3 style="${H3}">${esc(t)}</h3>`

  const risks = open('risk').sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.title).localeCompare(String(b.title)))
  const issues = open('issue').sort((a, b) => (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0) || String(a.due || '9999').localeCompare(String(b.due || '9999')))
  const deps = open('dependency').sort((a, b) => String(a.needBy || '9999').localeCompare(String(b.needBy || '9999')))
  const assumptions = list.filter(e => e.type === 'assumption' && e.status === 'open').sort((a, b) => String(a.validateBy || '9999').localeCompare(String(b.validateBy || '9999')))
  const decisions = list.filter(e => e.type === 'decision').sort((a, b) => String(b.decidedOn || '').localeCompare(String(a.decidedOn || ''))).slice(0, 10)

  const line = [
    `${plural(s.counts.risk.open, 'open risk')}${s.highRisks.length ? `, ${s.highRisks.length} high or critical` : ''}`,
    `${plural(s.counts.issue.open, 'open issue')}${s.overdueIssues.length ? `, ${s.overdueIssues.length} overdue` : ''}`,
    `${plural(s.counts.dependency.open, 'open dependency', 'open dependencies')}${s.dependenciesAtRisk.length ? `, ${s.dependenciesAtRisk.length} at risk` : ''}`,
    `${plural(s.counts.assumption.open, 'assumption')} to validate`,
    plural(s.counts.decision.total, 'decision')
  ].join('; ') + '.'

  const riskRows = risks.map(e => `<tr><td>${esc(e.title)}</td><td>${esc(e.owner)}</td><td class="n">${esc(`${e.likelihood}×${e.impact}`)}</td><td class="${['high', 'critical'].includes(riskLevel(e.score)) ? 'late' : ''}">${esc(riskLevel(e.score))}</td><td>${esc(e.mitigation)}</td><td class="nw">${late(e.reviewOn, e.reviewOn && e.reviewOn < today)}</td></tr>`)
  const issueRows = issues.map(e => `<tr><td>${esc(e.title)}</td><td>${esc(e.owner)}</td><td>${esc(e.severity)}</td><td>${esc(e.status)}</td><td class="nw">${late(e.due, e.due && e.due < today)}</td></tr>`)
  const depRows = deps.map(e => `<tr><td>${esc(e.title)}</td><td>${esc(e.on)}</td><td>${esc(e.direction === 'out' ? 'we deliver' : 'we wait')}</td><td>${esc(e.status)}</td><td class="nw">${late(e.needBy, e.needBy && e.needBy < today)}</td></tr>`)
  const assumptionRows = assumptions.map(e => `<tr><td>${esc(e.title)}</td><td>${esc(e.owner)}</td><td class="nw">${late(e.validateBy, e.validateBy && e.validateBy < today)}</td></tr>`)
  const decisionRows = decisions.map(e => `<tr><td class="nw">${esc(fmt(e.decidedOn))}</td><td>${esc(e.title)}</td><td>${esc(e.source === 'logbook' ? '' : e.decidedBy)}</td><td>${esc(e.source === 'logbook' ? `Logbook: ${e.entryTitle}` : e.rationale)}</td></tr>`)

  return `<h2>RAIDD log</h2>
<p class="meta">${esc(line)}</p>
${sub('Open risks, by score')}${table(['Risk', 'Owner', { t: 'L×I', n: true }, 'Level', 'Mitigation', { t: 'Review', nw: true }], riskRows)}
${sub('Open issues')}${table(['Issue', 'Owner', 'Severity', 'Status', { t: 'Due', nw: true }], issueRows)}
${sub('Dependencies')}${table(['Dependency', 'On', 'Direction', 'Status', { t: 'Need by', nw: true }], depRows)}
${sub('Assumptions to validate')}${table(['Assumption', 'Owner', { t: 'Validate by', nw: true }], assumptionRows)}
${sub('Decisions')}${table([{ t: 'Date', nw: true }, 'Decision', 'By', 'Why'], decisionRows)}${s.counts.decision.total > 10 ? `<p class="note">The last 10 of ${s.counts.decision.total} decisions.</p>` : ''}`
}

// ── routes ────────────────────────────────────────────────────────────
export function registerRoutes(app) {
  app.get('/api/raidd', wrap((req, res) => res.json(listFor(req.query.project))))
  app.post('/api/raidd', wrap((req, res) => res.status(201).json(create(req.body || {}))))
  app.patch('/api/raidd/:id', wrap((req, res) => { const e = update(req.params.id, req.body || {}); e ? res.json(e) : res.status(404).json({ error: 'That entry is not in the log any more.' }) }))
  app.delete('/api/raidd/:id', wrap((req, res) => {
    if (String(req.params.id).startsWith('logbook:')) throw bad('That decision lives in the Logbook. Change it there.')
    const gone = remove(req.params.id)
    gone ? res.json({ deleted: true, entry: gone }) : res.status(404).json({ error: 'That entry is not in the log any more.' })
  }))
}
