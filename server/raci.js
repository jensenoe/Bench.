/**
 * RACI per project (roadmap 169): who is Responsible, Accountable, Consulted and Informed for each activity.
 * One matrix per project, in the shared data folder (`raci` in db.js: raci.json, or a table on sqlite), so a
 * colleague on the same folder sees the same matrix.
 *
 * A project is a key: the I-code for an innovation project ("I-1050"), "plan:<id>" for a plan in projects.js.
 * A matrix is { project, people: [names, column order], rows: [{ id, activity, group? }],
 * cells: { rowId: { person: 'R'|'A'|'C'|'I'|'AR' } }, updatedAt, by }.
 *
 * Until the first edit nothing is stored: an innovation project starts from its five stages plus Gate review
 * and Budget, a plan from its phases. People are suggested from the project's tasks (lead, handed over by,
 * waiting on, the people a ticket is shared with), the attendees of Logbook entries that name the project,
 * and you. The matrix never touches a task.
 *
 *   GET    /api/raci?project=KEY   { matrix, suggestions, problems }
 *   PUT    /api/raci?project=KEY   saves the whole matrix (cleaned and clamped), answers as GET
 *   DELETE /api/raci?project=KEY   back to the starting rows, answers as GET
 *
 * The rules (checkRow, check) live in raci-rules.js, which the grid imports too. raciReportHtml is the
 * section for the PDF reports (report.js).
 */
import crypto from 'node:crypto'
import * as db from './db.js'
import * as store from './store.js'
import * as notes from './notes.js'
import * as projects from './projects.js'
import * as settings from './settings.js'
import { backupOnce } from './backup.js'
import { codeOf, mentions } from './codes.js'
import { normLetter, fold, check, checkRow, MAX_ROWS, MAX_PEOPLE, LETTERS } from './raci-rules.js'

export { check, checkRow, normLetter, fold, LETTERS, MAX_ROWS, MAX_PEOPLE }

const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))
const fail = (status, message) => Object.assign(new Error(message), { status })
const now = () => new Date().toISOString()
const clip = (v, n) => typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim().slice(0, n) : ''

// ── keys ──────────────────────────────────────────────────────────────
/** { key, kind: 'innovation', code } or { key, kind: 'plan', id }, or null when the text is not a project key. */
export function parseKey(key) {
  const s = String(key ?? '').trim()
  const plan = /^plan:([\w-]{1,80})$/.exec(s)
  if (plan) return { key: `plan:${plan[1]}`, kind: 'plan', id: plan[1] }
  if (/^I-\d{3,5}$/i.test(s)) { const code = codeOf(s); return { key: code, kind: 'innovation', code } }
  return null
}
const keyOrFail = key => {
  const k = parseKey(key)
  if (!k) throw fail(400, 'That is not a project key. Use an I-code such as I-1050, or plan: and the plan id.')
  return k
}
const planOf = k => k.kind === 'plan' ? projects.list().find(p => p.id === k.id) || null : null

// ── the starting rows ─────────────────────────────────────────────────
/** The five Phase Gate stages, then the two things every gate needs someone to own. */
export const INNOVATION_ROWS = [
  ...projects.INNOVATION_PHASES.map(p => ({ id: p.name.toLowerCase(), activity: p.name, group: 'Stages' })),
  { id: 'gate-review', activity: 'Gate review', group: 'Steering' },
  { id: 'budget', activity: 'Budget', group: 'Steering' }
]
/** Rows for a key with nothing stored: the stages for an I-code, the plan's phases for a plan, null when the plan is gone. */
export function startingRows(key) {
  const k = typeof key === 'string' ? parseKey(key) : key
  if (!k) return null
  if (k.kind === 'innovation') return INNOVATION_ROWS.map(r => ({ ...r }))
  const plan = planOf(k)
  if (!plan) return null
  return (plan.phases || []).slice(0, MAX_ROWS).map(ph => ({ id: `phase-${ph.id}`.slice(0, 64), activity: clip(ph.name, 120) || 'Phase' }))
}
const starting = k => {
  const rows = startingRows(k)
  return rows ? { project: k.key, people: [], rows, cells: {}, updatedAt: null, by: null } : null
}

// ── cleaning ──────────────────────────────────────────────────────────
const cleanName = v => clip(v, 60)
/**
 * The matrix as it may be stored: names trimmed and unique (accents and case ignored), at most 16 people
 * and 40 rows, row ids kept when they are sound, activities trimmed (an empty one gets a number), and only
 * letters from the five, for people and rows that exist.
 */
export function clean(input = {}, project = input.project) {
  const src = input && typeof input === 'object' ? input : {}
  const people = [], byFold = new Map()
  for (const p of Array.isArray(src.people) ? src.people : []) {
    const name = cleanName(p), f = fold(name)
    if (!name || byFold.has(f)) continue
    byFold.set(f, name); people.push(name)
    if (people.length >= MAX_PEOPLE) break
  }
  const rows = [], from = new Map()   // stored row id -> the id it came in with, for its cells
  for (const r of Array.isArray(src.rows) ? src.rows : []) {
    const row = typeof r === 'string' ? { activity: r } : r
    if (!row || typeof row !== 'object') continue
    const sound = typeof row.id === 'string' && /^[\w-]{1,64}$/.test(row.id) && !from.has(row.id)
    const id = sound ? row.id : crypto.randomUUID()
    from.set(id, sound ? row.id : null)
    const activity = clip(row.activity, 120) || `Activity ${rows.length + 1}`
    const group = clip(row.group, 40)
    rows.push(group ? { id, activity, group } : { id, activity })
    if (rows.length >= MAX_ROWS) break
  }
  const cells = {}
  const cellsIn = src.cells && typeof src.cells === 'object' ? src.cells : {}
  for (const row of rows) {
    const given = from.get(row.id) ? cellsIn[from.get(row.id)] : null
    if (!given || typeof given !== 'object') continue
    const out = {}
    for (const [who, letter] of Object.entries(given)) {
      const name = byFold.get(fold(who)), l = normLetter(letter)
      if (name && l) out[name] = l
    }
    if (Object.keys(out).length) cells[row.id] = out
  }
  return { project, people, rows, cells, updatedAt: src.updatedAt || null, by: src.by || null }
}

// ── storage ───────────────────────────────────────────────────────────
const col = () => db.collection('raci')   // at call time: the data folder can change under the tests
function readAll() {
  const c = col()
  try { const d = c.exists() ? c.read() : null; return d && Array.isArray(d.items) ? d : { items: [] } } catch { return { items: [] } }
}
function writeAll(doc) {
  const c = col()
  if (c.file && c.exists()) { try { backupOnce(c.file) } catch { /* the daily copy is a courtesy */ } }
  c.write(doc)
}
const stored = key => { const d = readAll().items.find(x => x.id === key); if (!d) return null; const { id: _id, ...m } = d; return m }

// ── people ────────────────────────────────────────────────────────────
const accented = s => /[^\x20-\x7e]/.test(s)
/** Of two spellings of one name, the one with its accents ("Noël" over "Noel"). */
const pick = (a, b) => accented(b) && !accented(a) ? b : a
/** The project's tasks and Logbook entries, by the same rule the Innovation and Projects pages use. */
function sourcesOf(k) {
  const tasks = store.allTasks(), entries = notes.listEntries()
  const entryText = e => [e.title, e.project, ...(e.tags || []), e.notes].join(' ')
  let code = k.kind === 'innovation' ? k.code : null, machine = ''
  if (k.kind === 'plan') {
    const plan = planOf(k)
    if (!plan) return { tasks: [], entries: [] }
    code = codeOf(plan.machine) || codeOf(plan.name)
    machine = fold(plan.machine)
  }
  if (code) return {
    tasks: tasks.filter(t => mentions(t.title, code) || mentions(t.project, code)),
    entries: entries.filter(e => mentions(entryText(e), code))
  }
  return {
    tasks: machine ? tasks.filter(t => fold(t.project) === machine) : [],
    entries: machine ? entries.filter(e => fold(e.project) === machine) : []
  }
}
/**
 * Names worth a column: you first, then everyone the project's tasks and meetings name, the most named
 * first. Accents and case do not make a second person; people already on the matrix are left out.
 */
export function suggestionsFor(key, people = []) {
  const k = typeof key === 'string' ? parseKey(key) : key
  if (!k) return []
  const { tasks, entries } = sourcesOf(k)
  const seen = new Map()   // fold -> { name, n, at }
  const add = (v, weight = 1) => {
    const name = cleanName(v)
    if (!name || name.length < 2 || name.includes('@') || !/\p{L}/u.test(name)) return
    const f = fold(name)
    const cur = seen.get(f)
    if (cur) { cur.n += weight; cur.name = pick(cur.name, name) } else seen.set(f, { name, n: weight, at: seen.size })
  }
  for (const t of tasks) {
    for (const v of [t.lead, t.assignedBy, t.waitingOn]) add(v)
    if (Array.isArray(t.meta?.with)) t.meta.with.forEach(v => add(v))
  }
  for (const e of entries) (e.attendees || []).forEach(v => add(v))
  const me = cleanName(settings.get().name)
  const taken = new Set(people.map(fold))
  const list = [...seen.entries()].filter(([f]) => !taken.has(f) && f !== fold(me))
    .sort((a, b) => b[1].n - a[1].n || a[1].at - b[1].at).map(([, v]) => v.name)
  if (me && !taken.has(fold(me))) list.unshift(pick(me, seen.get(fold(me))?.name || me))
  return list.slice(0, 24)
}

// ── the three answers ─────────────────────────────────────────────────
/** What GET answers: the stored matrix or the starting one, the names to suggest, and the checks. */
export function matrixFor(projectKey) {
  const k = keyOrFail(projectKey)
  const matrix = stored(k.key) || starting(k)
  if (!matrix) throw fail(404, 'That plan is gone, and no matrix was kept for it.')
  return { matrix, suggestions: suggestionsFor(k, matrix.people), problems: check(matrix) }
}
/** Saves the whole matrix for the key, cleaned and clamped. */
export function save(projectKey, input = {}) {
  const k = keyOrFail(projectKey)
  const body = input && typeof input === 'object' && input.matrix && typeof input.matrix === 'object' ? input.matrix : input
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'Send the matrix as an object with people, rows and cells.')
  const doc = readAll()
  const i = doc.items.findIndex(x => x.id === k.key)
  if (i < 0 && !startingRows(k)) throw fail(404, 'That plan is gone.')
  const m = { ...clean(body, k.key), updatedAt: now(), by: cleanName(settings.get().name) || null }
  const item = { id: k.key, ...m }
  if (i < 0) doc.items.push(item); else doc.items[i] = item
  writeAll(doc)
  return matrixFor(k.key)
}
/** Forgets the stored matrix: the key is back on its starting rows. */
export function reset(projectKey) {
  const k = keyOrFail(projectKey)
  const doc = readAll()
  const i = doc.items.findIndex(x => x.id === k.key)
  if (i >= 0) { doc.items.splice(i, 1); writeAll(doc) }
  return matrixFor(k.key)
}

// ── the PDF section ───────────────────────────────────────────────────
const SPLIT_AT = 8
const cellHtml = l => l === 'A' ? '<b>A</b>' : l === 'AR' ? '<b>A</b>R' : l || ''
/** "no A, two A" as a phrase for the note line. */
const phrase = p => p.code === 'noA' ? 'no A' : p.code === 'noR' ? 'no R' : p.short.replace(/^(\w+)/, s => s.toLowerCase())
/**
 * The RACI section of a project report, for the black-on-white A4 page in report.js: a compact table
 * (activities down, people across, A in bold), split into two when more than eight people, a note line
 * with any row that has no A, more than one A or no R, and the legend.
 */
export function raciReportHtml(matrix, { esc }) {
  const m = matrix || {}
  const people = Array.isArray(m.people) ? m.people : [], rows = Array.isArray(m.rows) ? m.rows : []
  const cells = m.cells || {}
  const head = '<h2>RACI</h2>'
  if (!rows.length) return `${head}<p class="none">No activities yet.</p>`
  if (!people.length) return `${head}<p class="none">Nobody is on the matrix yet.</p>`
  const half = Math.ceil(people.length / 2)
  const groups = people.length > SPLIT_AT ? [people.slice(0, half), people.slice(half)] : [people]
  const c = 'text-align:center'
  const table = (who, i) => `<table class="dense"${i ? ' style="margin-top:4mm"' : ''}><thead><tr><th>Activity</th>${who.map(p => `<th style="${c}">${esc(p)}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r => `<tr><td>${esc(r.activity)}</td>${who.map(p => `<td style="${c}">${cellHtml(normLetter(cells[r.id]?.[p]))}</td>`).join('')}</tr>`).join('')
  }</tbody></table>`
  const issues = rows.map(r => ({ r, p: checkRow(Object.fromEntries(people.map(p => [p, cells[r.id]?.[p]]))) })).filter(x => x.p.length)
  const note = issues.length ? `<p class="note">To settle: ${issues.map(x => `${esc(x.r.activity)}, ${esc(x.p.map(phrase).join(' and '))}`).join('; ')}.</p>` : ''
  return `${head}${groups.map(table).join('')}${note}<p class="note">R does the work. A owns the outcome, one per row. C is asked before. I is told after.</p>`
}

export function registerRoutes(app) {
  app.get('/api/raci', wrap((req, res) => res.json(matrixFor(req.query.project))))
  app.put('/api/raci', wrap((req, res) => res.json(save(req.query.project, req.body))))
  app.delete('/api/raci', wrap((req, res) => res.json(reset(req.query.project))))
}
