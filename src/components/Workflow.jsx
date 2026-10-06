import { useCallback, useEffect, useState } from 'react'
import { Check, ArrowRight, ArrowLeft, EnvelopeSimple, WarningCircle, FilePdf, Plus } from '@phosphor-icons/react'
import { getFlow, nextStep, stepBack, tickFlow, scopeTask, markEscalated, reportDone } from '../api/workflow.js'
import { patchProject } from '../api/projects.js'
import { getState, exportReport } from '../api.js'
import { ask } from './Confirm.jsx'
import { PanelSkeleton } from './Skeleton.jsx'
import { STATUS } from '../scenes.js'
import { scopeQuestion, DEFAULT_OWNER, fmtEn } from '../../server/workflow-rules.js'

/**
 * Paket and E2E on the plan page (roadmap 170), after Roman's working contract of 6 Oct 2026. A Paket comes
 * from its owner with a fixed result and a fixed date; an E2E is Noël's from kitting to handover. Both start by
 * making result and date clear, move one step at a time through gates, escalate early, and are done only when
 * every box is ticked. The rules are server/workflow-rules.js; the server checks every gate again.
 *
 *   KindFields    the kind, owner, their mail and the agreed result, in New project and in Edit
 *   KindChip      "Paket, Klären" on a card
 *   FlowPanels    the escalation banner, the stage track with its gate, and the done checklist
 *   AddToPaket    adds a board task to a Paket through the scope question
 */
const toast = (text, by) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true } }))
const refresh = () => window.dispatchEvent(new Event('bench:refresh'))
const btn = 'pill inline-flex min-h-[32px] items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-50'
const quiet = btn + ' btn-quiet', primary = btn + ' btn-primary', ghost = btn + ' btn-ghost'
const INP = 'field w-full px-3 py-2 text-[14px]'
const first = s => String(s || '').trim().split(' ')[0] || 'the owner'
const andList = xs => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : (xs[0] || '')

export const KINDS = [
  { key: 'plan', label: 'Plan', hint: 'Phases planned back from one date.' },
  { key: 'paket', label: 'Paket', hint: 'Projektierung: the owner sets result and date, you deliver exactly that and escalate early.' },
  { key: 'e2e', label: 'E2E', hint: 'Montage, Verkabelung, Service: yours end to end, from Rüsten to handover.' }
]
export const kindLabel = k => KINDS.find(x => x.key === k)?.label || 'Plan'

// ── the kind, in New project and in Edit ──────────────────────────────
function KindRadios({ value, onChange }) {
  const keys = e => {
    const i = KINDS.findIndex(k => k.key === value)
    const n = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % KINDS.length : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i + KINDS.length - 1) % KINDS.length : null
    if (n === null) return
    e.preventDefault(); onChange(KINDS[n].key)
    e.currentTarget.querySelectorAll('[role="radio"]')[n]?.focus()
  }
  return (
    <span role="radiogroup" aria-label="Kind of work" onKeyDown={keys} className="mt-1 flex flex-wrap gap-1">
      {KINDS.map(k => (
        <button key={k.key} type="button" role="radio" aria-checked={value === k.key} tabIndex={value === k.key ? 0 : -1} onClick={() => onChange(k.key)}
          className={ghost} style={value === k.key ? { background: 'var(--wash-2)', color: 'var(--ink)' } : undefined}>{k.label}</button>
      ))}
    </span>
  )
}

/**
 * Grid children for a two-column form: the kind, and for a Paket or E2E the owner, their mail and the result.
 * `part` 'kind' or 'details' splits them, so a form can put the name and the date in between.
 */
export function KindFields({ f, set, errors = {}, part = 'all' }) {
  const kind = f.kind || 'plan'
  return (
    <>
      {part !== 'details' && <div className="block sm:col-span-2"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Kind of work</span>
        <KindRadios value={kind} onChange={v => { set('kind', v); if (v !== 'plan' && !f.owner) set('owner', DEFAULT_OWNER) }} />
        <span className="mt-1 block text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{KINDS.find(k => k.key === kind)?.hint}</span></div>}
      {part !== 'kind' && kind !== 'plan' && <>
        <label className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{kind === 'paket' ? 'Owner of result and date' : 'Result and date from'}</span>
          <input value={f.owner || ''} onChange={e => set('owner', e.target.value)} placeholder={DEFAULT_OWNER} aria-invalid={Boolean(errors.owner) || undefined} className={INP + ' mt-1'} />
          {errors.owner && <span role="alert" className="mt-1 block text-[12.5px]" style={{ color: 'var(--caution)' }}>{errors.owner}</span>}</label>
        <label className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Their mail, for the drafts (optional)</span>
          <input type="email" value={f.ownerMail || ''} onChange={e => set('ownerMail', e.target.value)} placeholder="roman.dosch@…" className={INP + ' mt-1'} /></label>
        <label className="block sm:col-span-2"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>The agreed result, one line per item{kind === 'paket' ? '; each line becomes a box to tick before Report done' : ''}</span>
          <textarea value={f.result || ''} onChange={e => set('result', e.target.value)} rows={4} placeholder={'Wiring diagram for the Remote Coach, checked\nParts list with order numbers'} aria-invalid={Boolean(errors.result) || undefined} className={INP + ' mt-1 leading-relaxed'} />
          {errors.result && <span role="alert" className="mt-1 block text-[12.5px]" style={{ color: 'var(--caution)' }}>{errors.result}</span>}</label>
      </>}
    </>
  )
}

/** "Paket, Klären" on a plan's card; nothing for a plain plan. */
export function KindChip({ kind, step }) {
  if (!kind || kind === 'plan') return null
  const names = { klaeren: 'Klären', ruesten: 'Rüsten', bauen: 'Bauen', pruefen: 'Prüfen', dokumentieren: 'Dokumentieren', praesentieren: 'Präsentieren', uebergeben: 'Übergeben', fertig: 'Fertig', eingang: 'Eingang', liefern: 'Liefern', gemeldet: 'Fertig gemeldet' }
  return <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{kindLabel(kind)}{step ? `, ${names[step] || step}` : ''}</span>
}

// ── the pieces of the flow ────────────────────────────────────────────
function Box({ on, label, onFlip, disabled = false }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={onFlip} disabled={disabled} className="-ml-1 grid h-6 w-6 shrink-0 place-items-center disabled:opacity-50">
      <span className="grid h-4 w-4 place-items-center rounded-[4px] border transition-colors" style={{ borderColor: on ? STATUS.done : 'var(--line-2)', background: on ? STATUS.done : 'transparent' }}>
        {on && <Check size={10} weight="bold" color="var(--bg)" />}
      </span>
    </button>
  )
}

/** The steps as bars with their German names underneath; the current one in the accent, a skipped one dashed. */
export function FlowTrack({ steps, index }) {
  const now = steps[index]
  return (
    <div role="img" aria-label={now ? `Step ${index + 1} of ${steps.length}: ${now.name} (${now.en})` : 'No step yet'}>
      <div className="flex h-2 w-full gap-1">
        {steps.map((s, i) => (
          <span key={s.key} title={`${s.name} (${s.en})${s.skipped ? ', not needed' : ''}`} className="block h-full flex-1 rounded-full"
            style={s.skipped ? { border: '1px dashed var(--line-2)' } : { background: i === index ? 'var(--accent)' : i < index ? 'rgba(var(--ink-rgb),.34)' : 'var(--wash-2)' }} />
        ))}
      </div>
      <div className="mt-2 flex w-full gap-1 text-[12.5px]" aria-hidden="true">
        {steps.map((s, i) => <span key={s.key} className="min-w-0 flex-1 truncate" title={`${s.name} (${s.en})`} style={{ color: i === index ? 'var(--ink)' : 'var(--ink-3)', fontWeight: i === index ? 500 : 400, textDecoration: s.skipped ? 'line-through' : 'none' }}>{s.name}</span>)}
      </div>
    </div>
  )
}

/** One intake line: Result clear or Date clear, who confirmed it and when, or a field for who. */
function IntakeRow({ label, what, stamp, owner, onTick, busy, help }) {
  const [by, setBy] = useState('')
  return (
    <li className="rule flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <Box on={Boolean(stamp)} label={`${stamp ? 'Untick' : 'Tick'} ${label}`} onFlip={() => onTick(!stamp, by)} disabled={busy} />
      <span className="min-w-[110px] text-[14px]">{label}</span>
      {stamp
        ? <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>confirmed by {stamp.by || owner}, {fmtEn(stamp.at)}</span>
        : <>
          <input value={by} onChange={e => setBy(e.target.value)} placeholder={owner} aria-label={`Who confirmed the ${what}`} className="field w-[170px] px-2.5 py-1 text-[13px]" />
          {help && <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{help}</span>}
        </>}
    </li>
  )
}

function EscalationBanner({ f, onDone }) {
  const [busy, setBusy] = useState(false)
  const done = async () => {
    setBusy(true)
    try { await markEscalated(f.id); toast('Logged as escalated.', `A decision in the RAIDD log; quiet until the next working day is over.`); onDone() }
    catch (err) { toast('That did not work.', err.message) } finally { setBusy(false) }
  }
  return (
    <section aria-label="Escalate" className="panel flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4" style={{ background: 'color-mix(in srgb, var(--caution) 9%, var(--panel))' }}>
      <WarningCircle size={18} color="var(--caution)" aria-hidden="true" className="shrink-0" />
      <p className="min-w-[260px] flex-1 text-[14px] leading-relaxed">
        <span className="font-medium">Escalate to {first(f.owner)} now:</span> <span style={{ color: 'var(--ink-2)' }}>{f.escalation.map(r => r.text).join('; ')}.</span>
      </p>
      <a href={f.mail.escalate} target="_blank" rel="noopener noreferrer" className={quiet}><EnvelopeSimple size={13} weight="bold" /> Draft the note</a>
      <button type="button" onClick={done} disabled={busy} className={quiet}>Escalated</button>
    </section>
  )
}

function Gate({ f, busy, run }) {
  const now = f.steps[f.index]
  const lastBeforeDone = !f.next && !f.done
  const intakeText = f.intake.result && f.intake.date
    ? `Result and date confirmed by ${andList([...new Set([f.intake.result.by, f.intake.date.by].filter(Boolean))]) || f.owner}, ${fmtEn(f.intake.date.at > f.intake.result.at ? f.intake.date.at : f.intake.result.at)}.`
    : null
  const tick = (item, on, by) => run(() => tickFlow(f.id, item, on, by))
  const askLink = f.missing.some(m => m.key === 'result' || m.key === 'date')
  return (
    <div>
      <h3 className="text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>{f.intakeStep ? 'Before you start' : now?.key === 'ruesten' ? 'Before you build' : 'This step'}</h3>
      <p className="mt-1 max-w-[56ch] text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{now?.hint.replace('the owner', first(f.owner))}</p>
      {f.intakeStep ? (
        <ul className="mt-3 flex flex-col">
          <IntakeRow label="Result clear" what="result" stamp={f.intake.result} owner={f.owner} busy={busy} onTick={(on, by) => tick('intake.result', on, by)} help={f.resultLines.length ? null : 'Write the result down in Edit first.'} />
          <IntakeRow label="Date clear" what="date" stamp={f.intake.date} owner={f.owner} busy={busy} onTick={(on, by) => tick('intake.date', on, by)} help={f.deadline ? null : 'Set the date in Edit first.'} />
        </ul>
      ) : intakeText && <p className="mt-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>{intakeText}</p>}
      {f.kind === 'e2e' && now?.key === 'ruesten' && (
        <ul className="mt-3 flex flex-col">
          {f.kit.known
            ? <li className="rule py-2 text-[14px]" style={{ color: f.kit.complete ? STATUS.done : STATUS.caution }}>{f.kit.complete ? 'The kitting list is complete.' : 'The kitting list is not complete yet.'}</li>
            : <li className="rule flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <Box on={Boolean(f.kit.ticked)} label={`${f.kit.ticked ? 'Untick' : 'Tick'} Rüsten complete`} onFlip={() => tick('kit', !f.kit.ticked)} disabled={busy} />
              <span className="text-[14px]">Rüsten complete</span>
              {f.kit.ticked && <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{f.kit.ticked.by ? `${f.kit.ticked.by}, ` : ''}{fmtEn(f.kit.ticked.at)}</span>}
            </li>}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {f.next && <button type="button" onClick={() => run(() => nextStep(f.id, f.next.key), `Now: ${f.next.name}.`)} disabled={busy || f.missing.length > 0} className={primary}>Next: {f.next.name}. <ArrowRight size={13} weight="bold" /></button>}
        {askLink && <a href={f.mail.intake} target="_blank" rel="noopener noreferrer" className={quiet}><EnvelopeSimple size={13} weight="bold" /> Ask {first(f.owner)}</a>}
        {f.prev && !f.done && <button type="button" onClick={() => run(() => stepBack(f.id))} disabled={busy} className={ghost}><ArrowLeft size={13} weight="bold" /> Step back</button>}
      </div>
      {f.missing.length > 0 && <p className="mt-2 text-[13px]" style={{ color: STATUS.caution }}>Tick {andList(f.missing.map(m => m.text))} first{askLink ? `, or ask ${first(f.owner)} what is unclear` : ''}.</p>}
      {lastBeforeDone && <p className="mt-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>What is left is Report done, once every box on the right is ticked.</p>}
    </div>
  )
}

function DoneList({ f, busy, run, onChanged }) {
  const items = f.checklist
  const needed = items.filter(c => c.needed)
  const ticked = needed.filter(c => c.done).length
  const setPresent = async (v) => { try { await patchProject(f.id, { presentNeeded: v }); onChanged() } catch (err) { toast('That did not work.', err.message) } }
  const open = async () => {
    try { const at = await exportReport(`/api/report/done/${encodeURIComponent(f.id)}`, `${f.name} - done - ${f.doneAt || f.today}.pdf`); if (at) toast('Report saved.', at) }
    catch (err) { toast('The report did not save.', err.message) }
  }
  const report = () => run(async () => { const r = await reportDone(f.id); await open(); return r }, 'Reported done.')
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 className="text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>Done means done</h3>
        {needed.length > 0 && <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{ticked} of {needed.length} ticked</span>}
      </div>
      {items.length === 0
        ? <p className="mt-2 max-w-[56ch] text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>Write the agreed result in Edit, one line per item. Each line becomes a box here, and Report done waits for all of them.</p>
        : <ul className="mt-2 flex flex-col">
          {items.map(c => (
            <li key={c.key} className="rule flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <Box on={c.done} label={`${c.done ? 'Untick' : 'Tick'} ${c.label}`} onFlip={() => run(() => tickFlow(f.id, c.key, !c.done))} disabled={busy || f.done || !c.needed} />
              <span className="min-w-0 flex-1 text-[14px]" style={{ color: c.needed ? 'var(--ink)' : 'var(--ink-3)', textDecoration: c.needed ? 'none' : 'line-through' }}>{c.label}</span>
              {c.done && <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{fmtEn(c.at)}</span>}
              {c.optional && !f.done && <button type="button" onClick={() => setPresent(!c.needed)} className="-my-1 inline-block py-1 text-[13px] underline underline-offset-2" style={{ color: 'var(--ink-3)' }}>{c.needed ? 'Not needed here' : 'Needed after all'}</button>}
            </li>
          ))}
        </ul>}
      {f.done ? (
        <>
          <p className="mt-3 text-[14px]" style={{ color: STATUS.done }}>Reported done on {fmtEn(f.doneAt)}.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={open} className={quiet}><FilePdf size={13} weight="bold" /> The done report</button>
            <a href={f.mail.done} target="_blank" rel="noopener noreferrer" className={quiet}><EnvelopeSimple size={13} weight="bold" /> Draft the done mail</a>
            <button type="button" onClick={() => run(() => stepBack(f.id), 'Reopened.')} disabled={busy} className={ghost}>Reopen</button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={report} disabled={busy || !f.canReportDone} className={f.canReportDone ? primary : quiet}>Report done.</button>
          </div>
          {!f.canReportDone && <p className="mt-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>Still open: {andList(f.blockers.slice(0, 4))}{f.blockers.length > 4 ? ` and ${f.blockers.length - 4} more` : ''}.</p>}
        </>
      )}
    </div>
  )
}

/**
 * The flow of a Paket or an E2E, above the plan's tabs: the escalation banner when there is something to take
 * to the owner, then one panel with the stage track, the gate of the step and the done checklist.
 */
export function FlowPanels({ planId, version, onChanged }) {
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => getFlow(planId).then(setF).catch(() => {}), [planId])
  useEffect(() => { load() }, [load, version])
  useEffect(() => { addEventListener('bench:refresh', load); return () => removeEventListener('bench:refresh', load) }, [load])
  const run = async (fn, said) => {
    if (busy) return
    setBusy(true)
    try { const r = await fn(); if (r && r.steps) setF(r); else await load(); if (said) toast(said, f?.name); onChanged?.() }
    catch (err) { toast(/^Not /.test(err.message) ? 'Not yet.' : 'That did not work.', err.message) }
    finally { setBusy(false) }
  }
  if (!f) return <PanelSkeleton />
  if (f.kind === 'plan') return null
  const now = f.steps[f.index]
  return (
    <>
      {f.escalation.length > 0 && <EscalationBanner f={f} onDone={() => { load(); refresh() }} />}
      <section className="panel p-6 sm:p-7" aria-label={`${f.kind === 'paket' ? 'Paket' : 'E2E'} flow`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="display text-[22px] font-semibold leading-none">{f.done ? `${now?.name}.` : `Now: ${now?.name}.`}</h2>
          <span className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{f.kind === 'paket' ? `Paket from ${f.owner}` : `E2E, result and date from ${f.owner}`}, step {f.index + 1} of {f.steps.length}</span>
        </div>
        <div className="mt-4"><FlowTrack steps={f.steps} index={f.index} /></div>
        <div className="mt-6 grid gap-x-10 gap-y-6 lg:grid-cols-2">
          {f.done ? <div>
            <h3 className="text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>Delivered</h3>
            <ul className="mt-2 flex flex-col text-[14px]">
              <li className="rule py-2">{f.delivered === 1 ? '1 task' : `${f.delivered} tasks`} done on this plan.</li>
              <li className="rule py-2" style={{ color: f.openRaidd ? STATUS.caution : 'var(--ink)' }}>{f.openRaidd ? `${f.openRaidd} open in the RAIDD log; the report lists them.` : 'Nothing open in the RAIDD log.'}</li>
              {f.intake.result && f.intake.date && <li className="rule py-2" style={{ color: 'var(--ink-2)' }}>Result and date confirmed by {f.intake.date.by || f.owner}, {fmtEn(f.intake.date.at)}.</li>}
            </ul>
          </div> : <Gate f={f} busy={busy} run={run} />}
          <DoneList f={f} busy={busy} run={run} onChanged={() => { load(); onChanged?.() }} />
        </div>
      </section>
    </>
  )
}

// ── the scope guard ───────────────────────────────────────────────────
/** A board task joins the Paket only after the question: agreed adds it and logs the decision, not agreed logs a scope question. */
export function AddToPaket({ planId, machine, owner, onChanged }) {
  const [tasks, setTasks] = useState(null)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const loadTasks = useCallback(() => getState().then(s => setTasks((s.tasks || []).filter(t => !t.done && (t.project || '').trim().toLowerCase() !== String(machine || '').trim().toLowerCase())
    .sort((a, b) => String(a.title).localeCompare(String(b.title))))).catch(() => setTasks([])), [machine])
  useEffect(() => { loadTasks() }, [loadTasks])
  const add = async () => {
    const t = tasks?.find(x => x.id === pick); if (!t || busy) return
    const agreed = await ask(scopeQuestion(owner), { yes: 'Agreed, add it', no: 'Not agreed', title: 'Scope.' })
    setBusy(true)
    try {
      const r = await scopeTask(planId, t.id, agreed)
      toast(r.added ? 'Added to the Paket.' : 'Not added.', r.added ? `Decision logged: agreed with ${owner}.` : 'Logged as a scope question in the RAIDD log.')
      setPick(''); loadTasks(); refresh(); onChanged?.()
    } catch (err) { toast('That did not work.', err.message) } finally { setBusy(false) }
  }
  if (!tasks?.length) return null
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <select value={pick} onChange={e => setPick(e.target.value)} aria-label="A task from the board to add to the Paket" className="field min-w-[240px] max-w-full flex-1 cursor-pointer px-3 py-1.5 text-[13.5px] sm:flex-none">
        <option value="">A task from the board…</option>
        {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
      </select>
      <button type="button" onClick={add} disabled={!pick || busy} className={quiet}><Plus size={13} weight="bold" /> Add to the Paket</button>
      <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Anything new widens the Paket, so it asks first.</span>
    </div>
  )
}
