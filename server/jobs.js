/**
 * Jobs first (roadmap 175): every open Paket and E2E, and a plain plan when its date is close, as one list
 * that says where each job stands and what to do now. Roman's contract of 6 Oct 2026 in one look: "3 Pakete,
 * 1 E2E, Remote Coach due tonight, 1 question open with Roman."
 *
 *   jobs({ plans, tasks, raidd, kitting, today })   pure: the plans as stored (with `slack` when known), the
 *                                                    board's tasks, RAIDD entries and kit documents per key
 *                                                    ("plan:<id>"), today as yyyy-mm-dd; the ordered jobs out
 *   nextFor(job)                                     the one plain sentence that says what to do now
 *   gather(today)                                    the same from what is stored, for the route, Home and the report
 *   GET /api/jobs                                    { today, jobs }
 *
 * Order: jobs to escalate first, then by deadline (none last), then E2E before Paket before a plan on the same day.
 * Working days skip weekends, the holidays and the days off in Settings (workdays.js through projects.js).
 */
import * as R from './workflow-rules.js'
import { planProgress, kitCompleteDoc, bundleCheck } from './kitting-rules.js'
import * as projects from './projects.js'
import * as raiddMod from './raidd.js'
import * as store from './store.js'
import * as kitting from './kitting.js'

const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))
const isoToday = () => projects.isoOf(new Date())
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const first = s => String(s || '').trim().split(/\s+/)[0] || ''
const plusDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return projects.isoOf(d) }
/** Working days passed from a to b, as workflow.js counts them for escalation. */
const age = (a, b) => b <= a ? 0 : Math.max(0, projects.workingDaysBetween(a, b) - projects.workingDaysBetween(a, a))
const dayOf = v => { if (!v) return null; const s = String(v); return /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10)) && s.length <= 10 ? s : projects.isoOf(new Date(s)) }

export const PLAN_WINDOW = 14   // a plain plan joins the jobs when its date is this many days away or less
const KIND_RANK = { e2e: 0, paket: 1, plan: 2 }
const KIND_LABEL = { e2e: 'E2E', paket: 'Paket', plan: 'Plan' }

/** RAIDD entries for a key, from an object keyed by project or a flat list with `project`. */
const entriesFor = (raidd, key) => Array.isArray(raidd) ? raidd.filter(e => e?.project === key) : (Array.isArray(raidd?.[key]) ? raidd[key] : [])
const kitFor = (kitting, key) => {
  const d = Array.isArray(kitting) ? kitting.find(k => k?.project === key || k?.id === key) : kitting?.[key]
  return d && Array.isArray(d.machines) ? d : null
}

/** The step track of a plain plan: its phases, the current one running today, else the next, else the last. */
function phaseTrack(p, today) {
  const phases = Array.isArray(p.phases) ? p.phases : []
  const steps = phases.map(ph => ({ key: ph.id, name: ph.name, en: ph.name, skipped: false }))
  let i = phases.findIndex(ph => ph.start && ph.end && ph.start <= today && today <= ph.end)
  if (i < 0) i = phases.findIndex(ph => ph.start && ph.start > today)
  if (i < 0 && phases.length) i = phases.length - 1
  return { steps, index: i }
}

/** A plain plan is a job while its date is close: from today to PLAN_WINDOW days on, or past with work still open. */
const planIsJob = (p, today, openTasks) => Boolean(p.deadline) && (p.deadline < today ? openTasks > 0 : p.deadline <= plusDays(today, PLAN_WINDOW))

/** One job, everything the strip, the hero and the report read. */
function jobOf(p, { tasks, raidd, kitting, today }) {
  const kind = R.kindOf(p)
  const key = `plan:${p.id}`
  const mine = tasks.filter(t => projects.belongs(t, p))
  const openTasks = mine.filter(t => !t.done).length
  if (kind === 'plan' && !planIsJob(p, today, openTasks)) return null
  const daysLeft = p.deadline ? projects.gap(today, p.deadline) : null
  const slack = typeof p.slack === 'number' ? p.slack : daysLeft

  // the kit, from the Rüsten tab
  const doc = kitFor(kitting, key)
  const prog = doc ? planProgress(doc).overall : null
  const kitDone = doc ? kitCompleteDoc(doc) : null   // true, false, or null when no machine is on it yet
  const kit = prog && prog.machines ? { kitted: prog.kitted, total: prog.total, open: prog.open, machines: prog.machines, complete: prog.complete, presented: prog.presented, handedOver: prog.handedOver } : null

  // the questions: open issues and assumptions in the plan's RAIDD log
  const entries = entriesFor(raidd, key)
  const questions = entries.filter(e => !e.readOnly && (e.type === 'issue' || e.type === 'assumption') && raiddMod.isOpen(e))
  const oldest = questions.map(e => dayOf(e.createdAt)).filter(Boolean).sort()[0] || null

  const base = {
    id: p.id, key, name: p.name, kind, kindLabel: KIND_LABEL[kind], owner: p.owner || '', machine: p.machine || '',
    deadline: p.deadline || null, deadlineLabel: p.deadlineLabel || null, daysLeft, dueToday: p.deadline === today, late: daysLeft !== null && daysLeft < 0,
    questions: { open: questions.length, oldest, age: oldest ? age(oldest, today) : null, titles: questions.slice(0, 3).map(e => e.title) },
    kit, openTasks
  }
  if (kind === 'plan') {
    const { steps, index } = phaseTrack(p, today)
    const job = { ...base, step: steps[index]?.key || null, stepName: steps[index]?.name || null, steps, index, gate: { holds: false, why: [] }, escalation: [], escalating: false, done: { ticked: 0, total: 0 }, left: 0 }
    return finish(job)
  }
  const steps = R.stepsOf(p)
  const index = R.indexOf(p)
  const missing = R.missingFor(p, { kit: kitDone })
  const reasons = R.escalation(p, { today, slack, raiddSummary: raiddMod.summary(entries, today), openQuestions: entries.filter(e => !e.readOnly), age })
  const list = R.checklist(p).filter(c => c.needed)
  const blockers = R.doneBlockers(p, { kit: kitDone })
  const job = {
    ...base,
    step: p.step, stepName: steps[index]?.name || null, steps: steps.map(({ key, name, en, skipped }) => ({ key, name, en, skipped })), index,
    gate: { holds: missing.length > 0, why: missing.map(k => ({ key: k, text: R.GATE_TEXT[k] })) },
    intakeStep: R.INTAKE_STEPS[kind].includes(p.step),
    escalation: reasons.map(r => ({ key: r.key, text: r.text })), escalating: reasons.length > 0,
    done: { ticked: list.filter(c => c.done).length, total: list.length },
    left: list.filter(c => !c.done).length,
    canReportDone: blockers.length === 0,
    nextStep: R.nextOf(p)?.name || null,
    bundles: doc ? bundleCheck(doc) : null
  }
  return finish(job)
}
const finish = job => {
  const { text, tab } = nextFor(job)
  const { bundles: _b, ...rest } = job
  return { ...rest, next: text, tab, href: `#/projects?p=${encodeURIComponent(job.id)}${tab ? `&t=${tab}` : ''}` }
}

/** The first reason to escalate, in a few words: "due today", "2 working days behind". */
export function reasonWords(r) {
  if (!r) return ''
  if (r.key === 'deadline') return 'due today'
  if (r.key === 'room') return /behind/.test(r.text) ? r.text.replace(/ the date$/, '') : 'less than a day of room'
  if (r.key.startsWith('issue:')) return 'a question has waited too long'
  if (r.key.startsWith('dep:')) return 'a dependency is at risk'
  if (r.key.startsWith('assumption:')) return 'an assumption is not confirmed'
  return r.text
}

/**
 * What to do now, as one plain sentence, and the tab of the plan it belongs to ('kit', 'raidd' or null).
 * The first rule that applies:
 *   1. every box ticked                    "Report done to Roman."
 *   2. a reason to escalate                "Escalate: due today, 2 items open."
 *   3. result or date not confirmed        "Ask Roman: date not clear."
 *   4. a question open a working day       "Ask Roman: 1 question open for 2 working days."
 *   5. Rüsten                              "Rüsten: 18 items open on 3 machines." / "Rüsten: put the machines on the tab."
 *   6. Präsentieren                        "Present one machine from Bundle 6."
 *   7. Übergeben                           "Hand 3 machines over to Service."
 *   8. the gate is open, next is free      "Intake clear. Move on to Liefern."
 *   9. the step's own work                 "Liefern: 2 of 4 result lines left." / "Bauen: 5 tasks open."
 * A plain plan: "FAT today, 3 tasks open." / "FAT in 4 working days, nothing open."
 */
export function nextFor(job) {
  const who = first(job.owner) || 'the owner'
  const items = n => plural(n, 'item')
  if (job.kind === 'plan') {
    const label = job.deadlineLabel || 'Deadline'
    const when = job.daysLeft === null ? '' : job.daysLeft === 0 ? ' today' : job.daysLeft < 0 ? ` ${plural(-job.daysLeft, 'working day')} ago` : ` in ${plural(job.daysLeft, 'working day')}`
    const what = job.openTasks ? `, ${plural(job.openTasks, 'task')} open` : ', nothing open'
    return { text: `${label}${when}${what}.`, tab: null }
  }
  const kitOpen = job.step === 'ruesten' && job.kit && job.kit.open > 0 ? job.kit.open : 0
  if (job.canReportDone) return { text: `Report done to ${who}.`, tab: null }
  if (job.escalating) {
    const open = kitOpen || job.left
    return { text: `Escalate: ${reasonWords(job.escalation[0])}${open ? `, ${items(open)} open` : ''}.`, tab: null }
  }
  if (job.intakeStep && job.gate.holds) {
    const unclear = job.gate.why.map(w => w.key).filter(k => k === 'result' || k === 'date')
    if (unclear.length) return { text: `Ask ${who}: ${unclear.join(' and ')} not clear.`, tab: null }
  }
  if (job.questions.open && job.questions.age >= 1) {
    return { text: `Ask ${who}: ${plural(job.questions.open, 'question')} open for ${plural(job.questions.age, 'working day')}.`, tab: 'raidd' }
  }
  if (job.step === 'ruesten') {
    if (!job.kit) return { text: 'Rüsten: put the machines and their items on the Rüsten tab.', tab: 'kit' }
    if (job.kit.open) return { text: `Rüsten: ${items(job.kit.open)} open on ${plural(job.kit.machines - job.kit.complete, 'machine')}.`, tab: 'kit' }
    return { text: `Kit complete. Move on to ${job.nextStep || 'Bauen'}.`, tab: null }
  }
  if (job.step === 'praesentieren' && job.bundles && !job.bundles.ok) {
    const b = job.bundles
    const need = [!b.bundle1to5.length && 'one from Bundle 1 to 5', !b.bundle6.length && 'one from Bundle 6'].filter(Boolean)
    return { text: need.length === 2 ? 'Present one machine from Bundle 1 to 5 and one from Bundle 6.' : `Present ${need[0].replace('one', 'one machine')}.`, tab: 'kit' }
  }
  if (job.step === 'uebergeben' && job.kit && job.kit.handedOver < job.kit.machines) {
    return { text: `Hand ${plural(job.kit.machines - job.kit.handedOver, 'machine')} over to Service.`, tab: 'kit' }
  }
  if (job.intakeStep && !job.gate.holds && job.nextStep) return { text: `Intake clear. Move on to ${job.nextStep}.`, tab: null }
  if (job.kind === 'paket') {
    if (job.done.total) return { text: `${job.stepName}: ${job.left} of ${plural(job.done.total, 'result line')} left.`, tab: null }
    return { text: `Write the agreed result down with ${who}.`, tab: null }
  }
  const STEP = {
    bauen: job.openTasks ? `Bauen: ${plural(job.openTasks, 'task')} open. Ask early when something is unclear.` : 'Bauen: build it, and ask early when something is unclear.',
    pruefen: 'Prüfen: test it until it runs.',
    dokumentieren: 'Dokumentieren: write it down so someone else can service it.',
    praesentieren: 'Präsentieren: show it to the people who take it over.',
    uebergeben: `Tick what is done: ${items(job.left)} left.`
  }
  return { text: STEP[job.step] || `${job.stepName || 'Next'}: ${items(job.left)} left.`, tab: null }
}

/** Escalations first, then the nearest deadline (none last), then E2E before Paket before a plan, then the name. */
export const byUrgency = (a, b) => (b.escalating - a.escalating)
  || String(a.deadline || '9999-99-99').localeCompare(String(b.deadline || '9999-99-99'))
  || KIND_RANK[a.kind] - KIND_RANK[b.kind]
  || String(a.name).localeCompare(String(b.name))

/** Every open job, ordered. Pure: everything it reads comes in. */
export function jobs({ plans = [], tasks = [], raidd = {}, kitting = {}, today = isoToday() } = {}) {
  const out = []
  for (const p of plans) {
    if (!p || p.archived) continue
    const kind = R.kindOf(p)
    if (kind !== 'plan' && R.isDone(p)) continue
    try { const j = jobOf(p, { tasks, raidd, kitting, today }); if (j) out.push(j) } catch { /* one plan never stops the rest */ }
  }
  return out.sort(byUrgency)
}

/** The jobs from what is stored: the plans with their room, the board, each plan's RAIDD log and kit. */
export function gather(today = isoToday()) {
  const plans = projects.list().filter(p => !p.archived)
  const room = new Map()
  try { for (const s of projects.summaries(today)) room.set(s.id, s.slack) } catch { /* the room is a refinement */ }
  const raidd = {}, kit = {}
  for (const p of plans) {
    const key = `plan:${p.id}`
    try { raidd[key] = raiddMod.listFor(key, { today }).entries } catch { raidd[key] = [] }
    try { const d = kitting.docFor(key); if (d?.machines?.length) kit[key] = d } catch { /* no kit yet */ }
  }
  return jobs({ plans: plans.map(p => ({ ...p, slack: room.get(p.id) ?? null })), tasks: store.allTasks(), raidd, kitting: kit, today })
}

export function registerRoutes(app) {
  app.get('/api/jobs', wrap((_req, res) => { const today = isoToday(); res.json({ today, jobs: gather(today) }) }))
}
