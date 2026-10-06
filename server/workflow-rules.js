/**
 * Paket and E2E (roadmap 170): the working contract of 6 Oct 2026 as kinds of plan, pure, so the server, the
 * plan page and the tests read the same rules. No storage and no imports: server/workflow.js stores and
 * routes, src/components/Workflow.jsx draws.
 *
 * Two kinds of work besides a plain plan:
 *   e2e    assembly, wiring, service: Noël owns it end to end. Klären, Rüsten, Bauen, Prüfen, Dokumentieren,
 *          Präsentieren, Übergeben, Fertig. Done means it runs and someone else can rebuild or service it.
 *   paket  project engineering: the owner (Roman Dosch) owns result and date, Noël delivers exactly that.
 *          Eingang, Klären, Liefern, Fertig gemeldet. Wider only when agreed; a wobble is escalated at once.
 *
 *   cleanWorkflow(base, input, { trusted })   the workflow fields of a plan, validated
 *   stepsOf(plan)  nextOf(plan)  missingFor(plan, { kit })   the flow and its gates
 *   checklist(plan)  doneBlockers(plan, { kit })              done means done
 *   tickPatch(plan, item, on, { by, today })                  one box ticked or unticked, as a patch
 *   escalation(plan, { today, slack, raiddSummary, openQuestions, age })   reasons to escalate now
 *   intakeMail / escalationMail / doneMail                    prefilled mailto: links, never sent by Bench.
 */

export const KINDS = ['plan', 'paket', 'e2e']
export const DEFAULT_OWNER = 'Roman Dosch'
export const MAX = { owner: 80, mail: 120, result: 2000, lines: 20, line: 200, by: 80 }

/** The steps of each flow: key, the German name Noël uses, and the English for a tooltip. */
export const FLOWS = {
  e2e: [
    { key: 'klaeren', name: 'Klären', en: 'Clarify', hint: 'Result and date clear before anything else.' },
    { key: 'ruesten', name: 'Rüsten', en: 'Kit', hint: 'Kit everything before you build: parts, tools, drawings.' },
    { key: 'bauen', name: 'Bauen', en: 'Build', hint: 'Build it. Ask as soon as something is unclear, not at the end.' },
    { key: 'pruefen', name: 'Prüfen', en: 'Test', hint: 'Test it until it runs.' },
    { key: 'dokumentieren', name: 'Dokumentieren', en: 'Document', hint: 'Write it down so someone else can rebuild or service it.' },
    { key: 'praesentieren', name: 'Präsentieren', en: 'Present', hint: 'Show it to the people who take it over.' },
    { key: 'uebergeben', name: 'Übergeben', en: 'Hand over', hint: 'Hand it over into service.' },
    { key: 'fertig', name: 'Fertig', en: 'Done', hint: 'It runs, it is documented, someone else can take it on.' }
  ],
  paket: [
    { key: 'eingang', name: 'Eingang', en: 'Intake', hint: 'The Paket arrived. Write down the result and the date.' },
    { key: 'klaeren', name: 'Klären', en: 'Clarify', hint: 'Confirm result and date with the owner before you start.' },
    { key: 'liefern', name: 'Liefern', en: 'Deliver', hint: 'Deliver the agreed result. Nothing wider without the owner.' },
    { key: 'gemeldet', name: 'Fertig gemeldet', en: 'Reported done', hint: 'Reported done.' }
  ]
}
/** Steps that belong to the intake: nothing leaves them until result and date are confirmed. */
export const INTAKE_STEPS = { e2e: ['klaeren'], paket: ['eingang', 'klaeren'] }

/** The E2E definition of done. Presented is optional per plan (presentNeeded). */
export const DOD = [
  { key: 'runs', label: 'It runs', de: 'Läuft' },
  { key: 'documented', label: 'Documented', de: 'Dokumentiert' },
  { key: 'rebuild', label: 'Someone else could rebuild it or service it', de: 'Andere können es nachbauen oder in Service nehmen' },
  { key: 'presented', label: 'Presented', de: 'Präsentiert', optional: true }
]

export const kindOf = p => KINDS.includes(p?.kind) ? p.kind : 'plan'
const flowOf = p => FLOWS[kindOf(p)] || null
export const finalKey = p => flowOf(p)?.at(-1).key ?? null
export const isDone = p => Boolean(flowOf(p)) && p.step === finalKey(p)

// ── cleaning ──────────────────────────────────────────────────────────
const str = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const text = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, n)
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const day = v => { const s = String(v ?? '').slice(0, 10); return ISO_DAY.test(s) ? s : null }
const stamp = v => {   // { by, at } or null
  if (!v || typeof v !== 'object') return null
  const at = day(v.at); if (!at) return null
  return { by: str(v.by, MAX.by), at }
}
const MAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/
export const cleanMail = v => { const s = String(v ?? '').trim().slice(0, MAX.mail); return MAIL.test(s) ? s : '' }

/** The agreed result as checklist lines: one per line, bullets and numbering dropped, blank lines skipped. */
export function resultLines(result) {
  const seen = new Set()
  return String(result ?? '').replace(/\r\n?/g, '\n').split('\n')
    .map(l => l.replace(/^\s*(?:[-*•·]|\d+[.)]|\[[ xX]?\])\s*/, '').replace(/\s+/g, ' ').trim().slice(0, MAX.line))
    .filter(l => l && !seen.has(l.toLowerCase()) && seen.add(l.toLowerCase()))
    .slice(0, MAX.lines)
}

/**
 * The workflow fields of a plan. From any input: kind, owner, ownerMail, result, presentNeeded. Only with
 * { trusted: true } (server/workflow.js, after its gate checks): step, intake, kit, dod, resultDone, doneAt,
 * escalated. A plain PATCH can never move a step past a gate. A step the kind does not know goes to the
 * kind's first step; a plan has no step.
 */
export function cleanWorkflow(base = {}, input = {}, { trusted = false } = {}) {
  const pick = k => (k in input ? input[k] : base[k])
  const pickT = k => (trusted && k in input ? input[k] : base[k])
  const kind = KINDS.includes(pick('kind')) ? pick('kind') : 'plan'
  const flow = FLOWS[kind]
  let owner = str(pick('owner'), MAX.owner)
  if (!owner && kind !== 'plan') owner = DEFAULT_OWNER
  const stepIn = pickT('step')
  const step = flow ? (flow.some(s => s.key === stepIn) ? stepIn : flow[0].key) : null
  const intakeIn = pickT('intake') || {}
  const dodIn = pickT('dod') || {}
  const resultDoneIn = pickT('resultDone') || {}
  const escIn = pickT('escalated') || {}
  const result = text(pick('result'), MAX.result)
  const lines = new Set(resultLines(result))
  return {
    kind,
    owner,
    ownerMail: cleanMail(pick('ownerMail')),
    result,
    presentNeeded: pick('presentNeeded') === false || pick('presentNeeded') === 'false' ? false : true,
    step,
    intake: { result: stamp(intakeIn.result), date: stamp(intakeIn.date) },
    kit: stamp(pickT('kit')),
    dod: Object.fromEntries(DOD.map(d => [d.key, day(dodIn[d.key])])),
    // a tick belongs to the line's words: change the line and it has to be ticked again
    resultDone: Object.fromEntries(Object.entries(resultDoneIn && typeof resultDoneIn === 'object' ? resultDoneIn : {}).filter(([k, v]) => lines.has(k) && day(v)).map(([k, v]) => [k, day(v)])),
    doneAt: step && step === flow?.at(-1).key ? (day(pickT('doneAt')) || null) : null,
    escalated: Object.fromEntries(Object.entries(escIn && typeof escIn === 'object' ? escIn : {}).filter(([k, v]) => /^[\w:-]{1,90}$/.test(k) && day(v)).slice(0, 50).map(([k, v]) => [k, day(v)]))
  }
}

// ── the flow and its gates ────────────────────────────────────────────
/** The steps with `skipped` on Präsentieren when this plan needs no presentation. */
export function stepsOf(p) {
  const flow = flowOf(p); if (!flow) return []
  return flow.map(s => ({ ...s, skipped: s.key === 'praesentieren' && p.presentNeeded === false }))
}
export const indexOf = p => stepsOf(p).findIndex(s => s.key === p.step)
/** The step Next moves to, Präsentieren skipped when not needed; null on the last step before done and after. */
export function nextOf(p) {
  const steps = stepsOf(p), i = steps.findIndex(s => s.key === p.step)
  if (i < 0) return null
  for (let k = i + 1; k < steps.length - 1; k++) if (!steps[k].skipped) return steps[k]
  return null   // the final step is reached through Report done only
}
export function prevOf(p) {
  const steps = stepsOf(p), i = steps.findIndex(s => s.key === p.step)
  for (let k = i - 1; k >= 0; k--) if (!steps[k].skipped) return steps[k]
  return null
}
/** Is the kitting known complete? `kit` is what kitComplete(plan) said: true, false, or null for unknown. */
export const kitOk = (p, kit = null) => kit === true || kit === false ? kit : Boolean(p.kit)

/** What is still open in the intake: 'result' and 'date', each confirmed with who and when. */
export const intakeMissing = p => ['result', 'date'].filter(k => !p.intake?.[k])

export const GATE_TEXT = { result: 'Result clear', date: 'Date clear', kit: 'Rüsten complete' }
/** What blocks leaving the current step: the intake on Eingang and Klären, the kitting on Rüsten. */
export function missingFor(p, { kit = null } = {}) {
  const kind = kindOf(p); if (kind === 'plan') return []
  const out = []
  if (INTAKE_STEPS[kind].includes(p.step)) out.push(...intakeMissing(p))
  if (kind === 'e2e' && p.step === 'ruesten' && !kitOk(p, kit)) out.push('kit')
  return out
}

// ── done means done ───────────────────────────────────────────────────
/** E2E: the definition of done. Paket: the lines of the agreed result. `needed` false means it does not count. */
export function checklist(p) {
  const kind = kindOf(p)
  if (kind === 'e2e') return DOD.map(d => ({ key: `dod.${d.key}`, label: d.label, de: d.de, done: Boolean(p.dod?.[d.key]), at: p.dod?.[d.key] || null, optional: Boolean(d.optional), needed: !(d.optional && p.presentNeeded === false) }))
  if (kind === 'paket') return resultLines(p.result).map(l => ({ key: `result:${l}`, label: l, done: Boolean(p.resultDone?.[l]), at: p.resultDone?.[l] || null, optional: false, needed: true }))
  return []
}
/** Why Report done is still locked: the intake, the kitting (E2E) and every needed box. Empty means it may go. */
export function doneBlockers(p, { kit = null } = {}) {
  const kind = kindOf(p); if (kind === 'plan') return ['not a Paket or E2E plan']
  if (isDone(p)) return ['reported done already']
  const out = intakeMissing(p).map(k => GATE_TEXT[k])
  if (kind === 'e2e' && !kitOk(p, kit)) out.push(GATE_TEXT.kit)
  const items = checklist(p).filter(c => c.needed)
  if (!items.length) out.push(kind === 'paket' ? 'an agreed result to tick' : 'a checklist')
  for (const c of items) if (!c.done) out.push(c.label)
  return out
}

/**
 * One box, ticked or unticked, as a patch for cleanWorkflow({ trusted: true }). Items: 'intake.result',
 * 'intake.date', 'kit', 'dod.<key>', 'result:<line>'. Result clear needs a result written down, Date clear a
 * deadline. Throws { status: 400 } on an item the plan does not have.
 */
export function tickPatch(p, item, on, { by = '', today }) {
  const fail = m => { throw Object.assign(new Error(m), { status: 400 }) }
  const kind = kindOf(p); if (kind === 'plan') fail('A plain plan has no gates. Make it a Paket or an E2E first.')
  if (isDone(p)) fail('It is reported done. Step back first to change it.')
  on = on === true || on === 'true'
  if (item === 'intake.result' || item === 'intake.date') {
    const k = item.slice(7)
    if (on && k === 'result' && !resultLines(p.result).length) fail('Write the agreed result down first, one line per item.')
    if (on && k === 'date' && !p.deadline) fail('Set the date first.')
    return { intake: { ...p.intake, [k]: on ? { by: str(by, MAX.by) || p.owner || DEFAULT_OWNER, at: today } : null } }
  }
  if (item === 'kit') { if (kind !== 'e2e') fail('Only an E2E plan has a kitting gate.'); return { kit: on ? { by: str(by, MAX.by), at: today } : null } }
  if (item.startsWith('dod.')) {
    const k = item.slice(4); if (kind !== 'e2e' || !DOD.some(d => d.key === k)) fail('No such box.')
    return { dod: { ...p.dod, [k]: on ? today : null } }
  }
  if (item.startsWith('result:')) {
    const l = item.slice(7); if (kind !== 'paket' || !resultLines(p.result).includes(l)) fail('That line is not in the agreed result any more.')
    const next = { ...(p.resultDone || {}) }
    if (on) next[l] = today; else delete next[l]
    return { resultDone: next }
  }
  return fail('No such box.')
}

// ── early escalation ──────────────────────────────────────────────────
const noon = s => new Date(String(s).slice(0, 10) + 'T12:00:00')
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** Working days that have passed from a to b, weekends skipped: Mon to Tue is 1, Fri to Mon is 1. */
export function weekdayAge(a, b) {
  if (!a || !b || b <= a) return 0
  let n = 0
  for (const d = noon(a); ymd(d) < b;) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n++ }
  return n
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const fmtEn = iso => { if (!iso) return ''; const d = noon(iso); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` }
export const fmtDe = iso => { if (!iso) return ''; const d = noon(iso); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}` }
const clip = (s, n = 70) => { const t = str(s, 400); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t }
const dayOf = v => v ? (ISO_DAY.test(String(v).slice(0, 10)) && String(v).length <= 10 ? String(v).slice(0, 10) : ymd(new Date(v))) : null

/**
 * Reasons to escalate now, for a Paket or an E2E that is not done. Each is { key, text, de }:
 *   room          less than one working day of room before the deadline (or behind it)
 *   deadline      the deadline is today and the step is not the last one
 *   issue:<id>    an open RAIDD issue older than one working day
 *   dep:<id>      a dependency at risk (or past its need-by) for more than one working day
 *   assumption:<id>   an assumption past its validate-by date and not validated
 * `slack` is the plan's room in working days (null when not known). `raiddSummary` is raidd.summary() and
 * `openQuestions` the RAIDD entries (open ones count). `age(a, b)` counts working days from a to b; the server
 * passes one that knows the holidays. A reason escalated on day d (plan.escalated[key]) stays quiet that day and
 * the next working day.
 */
export function escalation(p, { today, slack = null, raiddSummary = null, openQuestions = [], age = weekdayAge } = {}) {
  const kind = kindOf(p)
  if (kind === 'plan' || !today || isDone(p)) return []
  const out = []
  const dueToday = p.deadline === today
  if (dueToday) out.push({ key: 'deadline', text: 'the deadline is today and it is not done', de: 'Der Termin ist heute, und es ist noch nicht fertig.' })
  if (p.deadline && typeof slack === 'number' && slack < 1 && (!dueToday || slack < 0)) {
    out.push(slack < 0
      ? { key: 'room', text: `${slack === -1 ? '1 working day' : `${-slack} working days`} behind the date`, de: `${slack === -1 ? '1 Arbeitstag' : `${-slack} Arbeitstage`} hinter dem Termin (${fmtDe(p.deadline)}).` }
      : { key: 'room', text: `less than a working day of room before ${fmtEn(p.deadline)}`, de: `Weniger als ein Arbeitstag Puffer bis zum Termin (${fmtDe(p.deadline)}).` })
  }
  const s = raiddSummary || {}
  const depIds = new Set(s.dependenciesAtRisk || [])
  const assumptionIds = new Set(s.assumptionsDue || [])
  const OPEN = { issue: ['open', 'in progress'], dependency: ['open', 'at risk'], assumption: ['open'] }
  for (const e of openQuestions || []) {
    if (!e || !OPEN[e.type]?.includes(e.status)) continue
    if (e.type === 'issue') {
      const since = dayOf(e.createdAt); if (!since || age(since, today) <= 1) continue
      out.push({ key: `issue:${e.id}`, text: `issue open since ${fmtEn(since)}: ${clip(e.title)}`, de: `Offenes Problem seit ${fmtDe(since)}: ${clip(e.title)}` })
    } else if (e.type === 'dependency') {
      const atRisk = e.status === 'at risk' || depIds.has(e.id) || (e.needBy && e.needBy < today)
      if (!atRisk) continue
      // since it went at risk (its last change), or since its need-by passed
      const since = e.status === 'at risk' ? dayOf(e.updatedAt || e.createdAt) : e.needBy
      if (!since || age(since, today) <= 1) continue
      out.push({ key: `dep:${e.id}`, text: `dependency at risk since ${fmtEn(since)}: ${clip(e.title)}`, de: `Abhängigkeit gefährdet seit ${fmtDe(since)}: ${clip(e.title)}` })
    } else if (e.type === 'assumption') {
      if (e.validated === true || !(assumptionIds.has(e.id) || (e.validateBy && e.validateBy < today))) continue
      out.push({ key: `assumption:${e.id}`, text: `assumption not validated by ${fmtEn(e.validateBy)}: ${clip(e.title)}`, de: `Annahme bis ${fmtDe(e.validateBy)} nicht bestätigt: ${clip(e.title)}` })
    }
  }
  const quiet = k => { const on = p.escalated?.[k]; return Boolean(on) && on <= today && age(on, today) <= 1 }
  return out.filter(r => !quiet(r.key))
}

// ── mail, drafted, never sent ─────────────────────────────────────────
const firstName = s => str(s, MAX.owner).split(' ')[0] || ''
const mailto = (p, subject, lines) => `mailto:${p.ownerMail ? p.ownerMail : ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\r\n'))}`
const sign = me => ['', 'Gruss', firstName(me) || ''].filter((x, i) => i < 2 || x)

/** "Ask Roman": what is unclear about result and date, in plain German. */
export function intakeMail(p, { me = '' } = {}) {
  const missing = intakeMissing(p)
  const lines = resultLines(p.result)
  const body = [`Hallo ${firstName(p.owner) || 'zusammen'}`, '', `Bevor ich mit «${p.name}» starte, möchte ich kurz klären:`]
  if (missing.includes('result') || !missing.length) {
    body.push('- Resultat: Was genau soll am Ende vorliegen?')
    if (lines.length) body.push(`  Mein Stand: ${lines.join('; ')}`)
  }
  if (missing.includes('date') || !missing.length) {
    body.push('- Termin: Bis wann brauchst du es?')
    if (p.deadline) body.push(`  Mein Stand: ${fmtDe(p.deadline)}`)
  }
  body.push('', 'Danke für eine kurze Bestätigung.', ...sign(me))
  return mailto(p, `${p.name}: Resultat und Termin klären`, body)
}

/** "Draft the note": the reasons to escalate, in German. */
export function escalationMail(p, reasons = [], { me = '' } = {}) {
  const body = [`Hallo ${firstName(p.owner) || 'zusammen'}`, '', `Bei «${p.name}»${p.deadline ? ` (Termin ${fmtDe(p.deadline)})` : ''} melde ich mich früh, bevor es knapp wird:`,
    ...reasons.map(r => `- ${r.de}`), '', 'Können wir heute kurz darüber sprechen?', ...sign(me)]
  return mailto(p, `${p.name}: früh eskaliert`, body)
}

/** "Draft the done mail": what was agreed and ticked, what was delivered, open points, the day. */
export function doneMail(p, { me = '', delivered = [], open = [] } = {}) {
  const items = checklist(p).filter(c => c.needed)
  const body = [`Hallo ${firstName(p.owner) || 'zusammen'}`, '', `«${p.name}» ist fertig${p.doneAt ? ` (${fmtDe(p.doneAt)})` : ''}.`, '',
    kindOf(p) === 'paket' ? 'Vereinbartes Resultat:' : 'Erledigt:', ...items.map(c => `- ${c.de || c.label}: ${c.done ? 'erledigt' : 'offen'}`)]
  if (delivered.length) body.push('', 'Geliefert:', ...delivered.slice(0, 15).map(t => `- ${clip(t, 90)}`), ...(delivered.length > 15 ? [`- und ${delivered.length - 15} weitere`] : []))
  body.push('', open.length ? `Offene Punkte im RAIDD-Log: ${open.length}.` : 'Keine offenen Punkte im RAIDD-Log.', 'Den Abschlussbericht hänge ich als PDF an.', ...sign(me))
  return mailto(p, `${p.name}: fertig`, body)
}

/** The scope question before a task joins a Paket. */
export function scopeQuestion(owner) {
  const first = firstName(owner) || 'the owner'
  return `This widens ${first}'s Paket. Agreed with ${owner === DEFAULT_OWNER ? 'him' : first}?`
}
