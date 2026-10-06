/**
 * Paket and E2E on a plan (roadmap 170): the flow, its gates, the scope guard, early escalation and done means
 * done, stored on the plan in projects.js and logged in the plan's RAIDD log (raidd.js, key "plan:<id>").
 * The rules are pure in workflow-rules.js; this module reads the plan, checks a gate, writes the step.
 *
 *   GET  /api/workflow/:id              the flow as the plan page draws it, with the mail drafts
 *   POST /api/workflow/:id/next         { to }  one step forward, when the gate lets it
 *   POST /api/workflow/:id/back         one step back (from done too: that reopens it)
 *   POST /api/workflow/:id/tick         { item, on, by }  Result clear, Date clear, Rüsten complete, a done box
 *   POST /api/workflow/:id/scope        { taskId, phase, agreed }  a task joins a Paket, or is logged as a question
 *   POST /api/workflow/:id/escalated    logs a RAIDD decision and quiets today's reasons for a working day
 *   POST /api/workflow/:id/done         Report done: every box ticked, step to Fertig, doneAt today
 *
 * The kitting hook: the Rüsten gate asks kitComplete(plan). A module that knows the kit (server/kitting.js)
 * exports `kitComplete(plan)` returning true, false, or null when it has no kit list for that plan, or calls
 * setKitProvider(fn) itself. Null falls back to the Rüsten complete checkbox. Tasks are only touched by the
 * scope guard, which sets the task's project and phase as Assign does.
 */
import * as projects from './projects.js'
import * as raidd from './raidd.js'
import * as store from './store.js'
import * as settings from './settings.js'
import * as R from './workflow-rules.js'

const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))
const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }
const isoToday = () => projects.isoOf(new Date())
const me = () => { try { return String(settings.get().name || '').trim() } catch { return '' } }
const clip = (s, n = 110) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t }
const andList = xs => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : (xs[0] || '')

// ── the kitting hook ──────────────────────────────────────────────────
let kitProvider = null
let kitLoad = null
/** Lets a module that keeps kit lists answer the Rüsten gate: fn(plan) returns true, false or null. */
export function setKitProvider(fn) { kitProvider = typeof fn === 'function' ? fn : null }
/** Looks once for server/kitting.js and its kitComplete export; quiet when the module is not there. */
export function loadKitting() {
  if (!kitLoad) kitLoad = import('./kitting.js').then(m => { if (!kitProvider && typeof m.kitComplete === 'function') kitProvider = m.kitComplete }).catch(() => {})
  return kitLoad
}
/** Is the kit for this plan complete? true or false when the kitting list knows, null when it does not. */
export function kitComplete(plan) {
  if (!kitProvider) return null
  try { const v = kitProvider(plan); return v === true || v === false ? v : null } catch { return null }
}

// ── reading ───────────────────────────────────────────────────────────
const find = id => projects.list().find(x => x.id === id) || null
const need = id => find(id) || fail(404, 'That plan is gone.')
/** Working days passed from a to b, the holidays and days off of Settings skipped. */
const age = (a, b) => b <= a ? 0 : Math.max(0, projects.workingDaysBetween(a, b) - projects.workingDaysBetween(a, a))
/** The room the plan page leads with: the tighter of the phases and the "waits for" chain. */
const roomOf = d => { const a = d.slack?.slack, b = d.forecast?.slack; return typeof b === 'number' && (a === null || a === undefined || b < a) ? b : (a ?? null) }

/** Everything the plan page draws for a Paket or an E2E, or { kind: 'plan' } for a plain plan. */
export function state(id, today = isoToday()) {
  const d = projects.detail(id, today); if (!d) return null
  const p = d.project
  const kind = R.kindOf(p)
  if (kind === 'plan') return { id, kind }
  const kit = kitComplete(p)
  let entries = [], summary = null
  try { ({ entries, summary } = raidd.listFor(`plan:${p.id}`, { today })) } catch { /* no log yet */ }
  const slack = roomOf(d)
  const reasons = R.escalation(p, { today, slack, raiddSummary: summary, openQuestions: entries.filter(e => !e.readOnly), age })
  const tasks = [...d.phases.flatMap(ph => ph.tasks), ...d.unassigned]
  const delivered = tasks.filter(t => t.done).map(t => t.title)
  const open = entries.filter(raidd.isOpen)
  const blockers = R.doneBlockers(p, { kit })
  return {
    id, kind, name: p.name, owner: p.owner, ownerMail: p.ownerMail, result: p.result, resultLines: R.resultLines(p.result),
    deadline: p.deadline, presentNeeded: p.presentNeeded !== false,
    steps: R.stepsOf(p), step: p.step, index: R.indexOf(p), next: R.nextOf(p), prev: R.prevOf(p),
    intakeStep: R.INTAKE_STEPS[kind].includes(p.step),
    missing: R.missingFor(p, { kit }).map(k => ({ key: k, text: R.GATE_TEXT[k] })),
    intake: p.intake || { result: null, date: null },
    kit: { known: kit !== null, complete: R.kitOk(p, kit), ticked: p.kit || null },
    checklist: R.checklist(p), blockers, canReportDone: blockers.length === 0,
    done: R.isDone(p), doneAt: p.doneAt || null,
    escalation: reasons, slack, today, openRaidd: open.length, delivered: delivered.length,
    mail: {
      intake: R.intakeMail(p, { me: me() }),
      escalate: reasons.length ? R.escalationMail(p, reasons, { me: me() }) : null,
      done: R.doneMail(p, { me: me(), delivered, open })
    }
  }
}

// ── moving ────────────────────────────────────────────────────────────
const workflowPlan = id => { const p = need(id); if (R.kindOf(p) === 'plan') fail(400, 'A plain plan has no flow. Make it a Paket or an E2E first.'); return p }

export async function next(id, { to } = {}, today = isoToday()) {
  await loadKitting()
  const p = workflowPlan(id)
  const n = R.nextOf(p)
  if (!n) fail(409, R.isDone(p) ? 'It is reported done already.' : 'What is left is Report done, once every box is ticked.')
  if (to && to !== n.key) fail(409, `The next step is ${n.name}.`)
  const missing = R.missingFor(p, { kit: kitComplete(p) })
  if (missing.length) fail(409, `Not yet: ${andList(missing.map(k => R.GATE_TEXT[k]))} first.`)
  projects.update(id, { step: n.key }, { trusted: true })
  return state(id, today)
}

export async function back(id, today = isoToday()) {
  await loadKitting()
  const p = workflowPlan(id)
  const prev = R.prevOf(p); if (!prev) fail(409, 'This is the first step.')
  projects.update(id, { step: prev.key, doneAt: null }, { trusted: true })
  return state(id, today)
}

export async function tick(id, { item, on, by } = {}, today = isoToday()) {
  await loadKitting()
  const p = workflowPlan(id)
  projects.update(id, R.tickPatch(p, String(item || ''), on, { by: by || (item === 'kit' || String(item).startsWith('dod.') ? me() : ''), today }), { trusted: true })
  return state(id, today)
}

/**
 * The scope guard. A task already on the Paket only changes phase. A new one: agreed adds it (project and
 * phase, as Assign does) and logs the decision "Scope: <task> added, agreed with <owner>"; not agreed logs the
 * issue "Scope question: <task>" and leaves the task where it was.
 */
export async function scope(id, { taskId, phase = null, agreed } = {}, today = isoToday()) {
  const p = need(id)
  if (R.kindOf(p) !== 'paket') fail(400, 'Only a Paket has a scope guard.')
  const task = store.allTasks().find(t => t.id === String(taskId || '')) || fail(404, 'That task is gone.')
  const ph = phase && p.phases.some(x => x.id === phase) ? phase : null
  const key = `plan:${p.id}`
  if (projects.belongs(task, p)) return { added: true, task: store.updateTask(task.id, { phase: ph, project: p.machine }), entry: null }
  if (agreed !== true && agreed !== false) fail(400, 'Say whether it was agreed: agreed true or false.')
  if (agreed) {
    const t = store.updateTask(task.id, { phase: ph, project: p.machine })
    const entry = raidd.create({ project: key, type: 'decision', title: `Scope: ${clip(task.title)} added, agreed with ${p.owner}`, decidedBy: p.owner, decidedOn: today, rationale: `Added to the Paket after the intake. ${p.owner} agreed.` })
    return { added: true, task: t, entry }
  }
  const entry = raidd.create({ project: key, type: 'issue', title: `Scope question: ${clip(task.title)}`, owner: p.owner, severity: 'medium', detail: `"${clip(task.title, 300)}" would widen the Paket. Not agreed with ${p.owner} yet, so it stays off the Paket.` })
  return { added: false, task, entry }
}

/** "Escalated": one RAIDD decision with the date and the reasons; each reason stays quiet for a working day. */
export async function escalated(id, today = isoToday()) {
  await loadKitting()
  const p = workflowPlan(id)
  const reasons = state(id, today).escalation
  if (!reasons.length) fail(409, 'Nothing to escalate right now.')
  const entry = raidd.create({ project: `plan:${p.id}`, type: 'decision', title: `Escalated to ${p.owner}: ${reasons.map(r => r.text).join('; ')}`, decidedOn: today, decidedBy: me(), rationale: reasons.map(r => r.de).join(' ') })
  projects.update(id, { escalated: { ...(p.escalated || {}), ...Object.fromEntries(reasons.map(r => [r.key, today])) } }, { trusted: true })
  return { entry, state: state(id, today) }
}

/** Report done: only when every box is ticked. Sets the last step and doneAt. */
export async function done(id, today = isoToday()) {
  await loadKitting()
  const p = workflowPlan(id)
  const blockers = R.doneBlockers(p, { kit: kitComplete(p) })
  if (blockers.length) fail(409, `Not done yet: ${andList(blockers)}.`)
  projects.update(id, { step: R.finalKey(p), doneAt: today }, { trusted: true })
  return { ...state(id, today), report: `/api/report/done/${encodeURIComponent(id)}` }
}

/** Every open Paket and E2E with reasons to escalate today, for alerts.js. */
export function escalations(today = isoToday()) {
  const out = []
  for (const p of projects.list()) {
    if (p.archived || R.kindOf(p) === 'plan' || R.isDone(p)) continue
    try { const s = state(p.id, today); if (s?.escalation?.length) out.push({ id: p.id, name: p.name, owner: p.owner, reasons: s.escalation }) } catch { /* one plan never stops the rest */ }
  }
  return out
}

export function registerRoutes(app) {
  app.get('/api/workflow/:id', wrap(async (req, res) => { await loadKitting(); const s = state(req.params.id); s ? res.json(s) : res.status(404).json({ error: 'That plan is gone.' }) }))
  app.post('/api/workflow/:id/next', wrap(async (req, res) => res.json(await next(req.params.id, req.body || {}))))
  app.post('/api/workflow/:id/back', wrap(async (req, res) => res.json(await back(req.params.id))))
  app.post('/api/workflow/:id/tick', wrap(async (req, res) => res.json(await tick(req.params.id, req.body || {}))))
  app.post('/api/workflow/:id/scope', wrap(async (req, res) => res.json(await scope(req.params.id, req.body || {}))))
  app.post('/api/workflow/:id/escalated', wrap(async (req, res) => res.json(await escalated(req.params.id))))
  app.post('/api/workflow/:id/done', wrap(async (req, res) => res.json(await done(req.params.id))))
}
