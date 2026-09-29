import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Plus, Trash, ArrowsClockwise, PencilSimple, X } from '@phosphor-icons/react'
import { getProjects, getProject, createProject, patchProject, removeProject, scheduleProject, assignPhase } from '../api/projects.js'
import { getMachines } from '../api/machines.js'
import { getPlaybooks } from '../api/playbooks.js'
import DateField from './DateField.jsx'
import { PanelSkeleton } from './Skeleton.jsx'
import LoadFailed from './LoadFailed.jsx'
import { ask } from './Confirm.jsx'
import { STATUS } from '../scenes.js'
import { patchTask, saveSettings } from '../api.js'
import { InnovationList, InnovationDetail, codeFromHash } from './Innovation.jsx'

/**
 * Projects (roadmap 121 to 125): one page that plans a machine. A project is a goal, a machine, the one date
 * that matters and the phases in order before it. The dates fall out of the deadline: the last phase ends on
 * it, every phase before ends the working day before the next begins. Tasks join a phase through their
 * project text and a phase select; parts with a supplier get an order-by date from the learned lead times.
 * The timeline, the slack and the fit are read from that, nothing is typed twice. #/projects?p=<id> opens one.
 * Above the plans sit the innovation projects from Planner (Innovation.jsx, roadmap 143); #/projects?i=<code> opens one.
 */
const toast = (text, by) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true } }))
const refresh = () => window.dispatchEvent(new Event('bench:refresh'))
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const btn = 'pill inline-flex min-h-[32px] items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-50'
const quiet = btn + ' btn-quiet', primary = btn + ' btn-primary', ghost = btn + ' btn-ghost'
const INP = 'field w-full px-3 py-2 text-[14px]'
const LABELS = ['FAT', 'Delivery', 'Handover', 'Milestone']
const idFromHash = () => new URLSearchParams(location.hash.split('?')[1] || '').get('p')
const setHash = (id) => { location.hash = id ? `#/projects?p=${encodeURIComponent(id)}` : '#/projects' }
const noon = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "28 Sep": three letters for every month (the en-GB locale writes "Sept"). */
const fmt = iso => { if (!iso) return ''; const d = noon(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}` }
const fmtLong = iso => iso ? noon(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : ''
const dayIndex = (iso, from) => Math.round((noon(iso) - noon(from)) / 86400000)
const roomText = (slack) => slack === null || slack === undefined ? 'no dated work yet'
  : slack < 0 ? `${plural(-slack, 'working day')} behind the plan` : slack === 0 ? 'no room left' : `${plural(slack, 'working day')} of room`
/** "Christmas 25 Dec, days off 28 to 31 Dec, New Year's Day 1 Jan": consecutive days with the same name become one range. */
const offRuns = list => {
  const runs = []
  for (const o of list) {
    const prev = runs.at(-1)
    const next = prev && (() => { const d = noon(prev.to); d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
    if (prev && prev.name === o.name && next === o.date) prev.to = o.date
    else runs.push({ name: o.name, from: o.date, to: o.date })
  }
  return runs.map(r => r.from === r.to ? `${r.name} ${fmt(r.from)}` : `${r.name === 'Day off' ? 'days off' : r.name} ${r.from.slice(0, 7) === r.to.slice(0, 7) ? fmt(r.from).split(' ')[0] : fmt(r.from)} to ${fmt(r.to)}`).join(', ')
}
const REGION_LABEL = { ZH: 'Zurich holidays', CH: 'Swiss federal holidays', none: 'no public holidays' }
/** The room the page leads with: the tighter of the phases and the "waits for" chain. */
const roomOf = d => { const a = d.slack.slack, b = d.forecast?.slack; return b !== null && b !== undefined && (a === null || b < a) ? b : a }
const roomTone = (slack) => slack === null || slack === undefined ? 'var(--ink-3)' : slack < 0 ? STATUS.overdue : slack <= 2 ? STATUS.caution : STATUS.done

// ── the list ──────────────────────────────────────────────────────────
function ProjectCard({ p }) {
  const phases = p.phases || []
  return (
    <a href={`#/projects?p=${encodeURIComponent(p.id)}`} className="panel block p-6 transition-transform hover:-translate-y-0.5" aria-label={p.name}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="display text-[22px] font-semibold leading-none">{p.name}.</h2>
        <span className="tnum text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{plural(p.open, 'open task')}{p.done ? `, ${p.done} done` : ''}</span>
      </div>
      {p.goal && <p className="mt-2 max-w-[60ch] text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{p.goal}</p>}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13.5px]" data-volatile>
        {p.deadline
          ? <span><span style={{ color: 'var(--ink-3)' }}>{p.deadlineLabel} </span><span className="tnum font-medium">{fmtLong(p.deadline)}</span>{p.daysLeft !== null && <span className="tnum" style={{ color: 'var(--ink-3)' }}>, {p.daysLeft < 0 ? `${-p.daysLeft} working days ago` : `in ${plural(p.daysLeft, 'working day')}`}</span>}</span>
          : <span style={{ color: 'var(--ink-3)' }}>No deadline yet.</span>}
        <span style={{ color: roomTone(p.slack) }}>{roomText(p.slack)}{p.late ? `, ${plural(p.late, 'task')} late` : ''}</span>
        {p.current && <span style={{ color: 'var(--ink-3)' }}>now: {p.current}</span>}
      </div>
      {phases.length > 0 && phases[0].start && (
        <div className="mt-4 flex h-1.5 w-full gap-px overflow-hidden rounded-full" aria-hidden="true">
          {phases.map((ph, i) => <span key={ph.id} className="block h-full" style={{ flex: Math.max(1, ph.days), background: i % 2 ? 'rgba(var(--ink-rgb),.28)' : 'rgba(var(--ink-rgb),.16)' }} title={`${ph.name}: ${fmt(ph.start)} to ${fmt(ph.end)}`} />)}
        </div>
      )}
    </a>
  )
}

function NewProject({ machines, onCreated }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', machine: '', goal: '', deadline: '', deadlineLabel: 'FAT', playbookId: '' })
  const [busy, setBusy] = useState(false)
  const [books, setBooks] = useState([])
  const [noName, setNoName] = useState(false)
  const nameRef = useRef(null)
  const back = useRef(false)   // the New project button takes focus when Cancel or Escape brings it back
  useEffect(() => { if (open) getPlaybooks().then(b => setBooks(Array.isArray(b) ? b : [])).catch(() => {}) }, [open])
  const set = (k, v) => { setF(s => ({ ...s, [k]: v })); if (k === 'name') setNoName(false) }
  const book = books.find(b => b.id === f.playbookId)
  const cancel = () => { setOpen(false); setNoName(false); back.current = true }
  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (!f.name.trim()) { setNoName(true); nameRef.current?.focus(); return }
    setBusy(true)
    try {
      const { playbookId, ...rest } = f
      const p = await createProject({ ...rest, machine: f.machine.trim() || f.name.trim(), ...(playbookId ? { playbookId } : {}) })
      const fb = p.fromPlaybook
      toast('Planned from the deadline.', fb ? `${p.name}: ${plural(fb.created, 'task')} from ${fb.name}, ${fb.placed === fb.created ? 'each in its phase' : `${fb.placed} in their phases`}.` : p.name)
      setOpen(false); setF({ name: '', machine: '', goal: '', deadline: '', deadlineLabel: 'FAT', playbookId: '' }); onCreated(p); refresh()
    } catch (err) { toast('That did not work.', err.message) } finally { setBusy(false) }
  }
  if (!open) return <button ref={el => { if (el && back.current) { back.current = false; el.focus({ preventScroll: true }) } }} onClick={() => setOpen(true)} className={primary}><Plus size={13} weight="bold" /> New project</button>
  return (
    <form onSubmit={submit} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancel() } }} className="panel grid gap-3 p-6 sm:grid-cols-2" aria-label="New project">
      <label className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Name</span>
        <input ref={nameRef} autoFocus value={f.name} onChange={e => set('name', e.target.value)} placeholder="Leg press 7" aria-invalid={noName || undefined} aria-describedby={noName ? 'new-project-name-msg' : undefined} className={INP + ' mt-1'} />
        {noName && <span id="new-project-name-msg" role="alert" className="mt-1 block text-[12.5px]" style={{ color: 'var(--caution)' }}>Give the project a name first; the machine takes it when left empty.</span>}</label>
      <label className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Machine, as tasks name it in Project</span>
        <input list="project-machines" autoComplete="off" value={f.machine} onChange={e => set('machine', e.target.value)} placeholder="same as the name when empty" className={INP + ' mt-1'} />
        <datalist id="project-machines">{machines.map(m => <option key={m} value={m} />)}</datalist></label>
      <div className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>The date that matters</span>
        <DateField className="mt-1" value={f.deadline} onChange={v => set('deadline', v || '')} placeholder="pick the day" /></div>
      <label className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>What that date is</span>
        <select value={f.deadlineLabel} onChange={e => set('deadlineLabel', e.target.value)} className={INP + ' mt-1 cursor-pointer'}>{LABELS.map(l => <option key={l}>{l}</option>)}</select></label>
      <label className="block sm:col-span-2"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Start from</span>
        <select value={f.playbookId} onChange={e => set('playbookId', e.target.value)} className={INP + ' mt-1 cursor-pointer'}>
          <option value="">Seven standard phases, no tasks</option>
          {books.map(b => <option key={b.id} value={b.id}>{b.name}: {b.phases?.length ? plural(b.phases.length, 'phase') : 'the seven phases'}, {plural(b.tasks.length, 'task')}</option>)}
        </select></label>
      <label className="block sm:col-span-2"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Goal, one sentence</span>
        <input value={f.goal} onChange={e => set('goal', e.target.value)} placeholder="Runs the full test protocol before the customer arrives." className={INP + ' mt-1'} /></label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={busy} aria-busy={busy || undefined} className={primary}>Create and plan</button>
        <button type="button" onClick={cancel} className={ghost}>Cancel</button>
        <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{book ? `The phases and the ${plural(book.tasks.length, 'task')} of ${book.name}, each task in its phase.` : 'Seven phases to start with, Design to Handover. Change them on the next page.'}</span>
      </div>
    </form>
  )
}

// ── the timeline ──────────────────────────────────────────────────────
/** Weeks across, one row per phase, the parts as dashed order runs, today and the deadline as lines. */
function Timeline({ d }) {
  const { project: p, phases, orders, today } = d
  const dated = phases.filter(x => x.start && x.end)
  if (!dated.length) return <p className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Set a deadline and the timeline draws itself.</p>
  const starts = [dated[0].start, today, ...orders.map(o => o.orderBy).filter(Boolean)].sort()
  const from = starts[0]
  const ends = [dated.at(-1).end, today, p.deadline].filter(Boolean).sort()
  const to = ends.at(-1)
  const total = Math.max(7, dayIndex(to, from) + 2)
  const W = 960, PAD_L = 150, PAD_R = 24, ROW = 26, TOP = 26
  const H = TOP + phases.length * ROW + 30
  const x = iso => PAD_L + (dayIndex(iso, from) / total) * (W - PAD_L - PAD_R)
  const weeks = []
  for (const d0 = noon(from); d0 <= noon(to); d0.setDate(d0.getDate() + 1)) if (d0.getDay() === 1) weeks.push(new Date(d0))
  const iso = d0 => `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`
  const byPhase = Object.fromEntries(phases.map((ph, i) => [ph.id, i]))
  const dayW = (W - PAD_L - PAD_R) / total
  const labelEvery = Math.max(1, Math.ceil(48 / (dayW * 7)))   // a label needs about 48 units; skip weeks until it has them
  const fc = d.forecast?.tasks || {}
  const onChain = new Set((d.forecast?.chain || []).map(c => c.id))
  const rowOf = Object.fromEntries(phases.flatMap(ph => ph.tasks.map(t => [t.id, byPhase[ph.id]])))
  const planned = phases.flatMap(ph => ph.tasks).filter(t => fc[t.id] && !fc[t.id].done)
  const barY = (id, k) => TOP + rowOf[id] * ROW + ROW - 7 - (k % 2) * 3
  const tone = f => f.slack !== null && f.slack < 0 ? STATUS.overdue : 'var(--accent)'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Timeline of the phases" data-volatile style={{ fontFamily: 'inherit' }}>
      {(d.daysOff || []).filter(o => o.date >= from && o.date <= to).map(o => <rect key={o.date} x={x(o.date)} y={TOP - 6} width={Math.max(2, dayW)} height={H - TOP - 18} fill="rgba(var(--ink-rgb),.07)"><title>{o.name}, {fmt(o.date)}</title></rect>)}
      {weeks.map((w, k) => <g key={+w}><line x1={x(iso(w))} x2={x(iso(w))} y1={TOP - 6} y2={H - 24} stroke="rgba(var(--ink-rgb),.1)" />
        {k % labelEvery === 0 && <text x={x(iso(w)) + 3} y={TOP - 10} fontSize="11" fill="var(--ink-3)">{fmt(iso(w))}</text>}</g>)}
      {phases.map((ph, i) => {
        const y = TOP + i * ROW
        return (
          <g key={ph.id}>
            <text x={PAD_L - 10} y={y + 15} fontSize="12" textAnchor="end" fill="var(--ink-2)">{ph.name}</text>
            {ph.start && ph.end && <rect x={x(ph.start)} y={y + 4} width={Math.max(3, x(ph.end) - x(ph.start) + (W - PAD_L - PAD_R) / total)} height={ROW - 8} rx="4" fill={i % 2 ? 'rgba(var(--ink-rgb),.22)' : 'rgba(var(--ink-rgb),.13)'} />}
            {ph.tasks.filter(t => t.dueDate).map(t => <circle key={t.id} cx={x(t.dueDate.slice(0, 10))} cy={y + ROW / 2} r="3.5" fill={t.done ? 'var(--ink-3)' : t.dueDate.slice(0, 10) < today ? STATUS.overdue : 'var(--ink)'}><title>{t.title}, due {fmt(t.dueDate)}</title></circle>)}
          </g>
        )
      })}
      {orders.filter(o => o.orderBy && o.needBy).map(o => {
        const i = o.phase && byPhase[o.phase] !== undefined ? byPhase[o.phase] : phases.length - 1
        const y = TOP + i * ROW + ROW / 2
        return <g key={o.taskId}><line x1={x(o.orderBy)} x2={x(o.needBy)} y1={y} y2={y} stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 3" />
          <circle cx={x(o.orderBy)} cy={y} r="3" fill="var(--accent)"><title>{o.title}: order by {fmt(o.orderBy)} for {fmt(o.needBy)}</title></circle></g>
      })}
      {planned.map((t, k) => {
        const f = fc[t.id], y = barY(t.id, k)
        return <g key={'fc' + t.id}>
          <rect x={x(f.start)} y={y - 1.5} width={Math.max(3, x(f.finish) - x(f.start) + dayW)} height="3" rx="1.5" fill={tone(f)} opacity={onChain.has(t.id) ? 1 : .55}><title>{t.title}: {fmt(f.start)} to {fmt(f.finish)}{f.slack !== null ? `, ${roomText(f.slack)}` : ''}</title></rect>
          {(t.after || []).filter(p => fc[p] && !fc[p].done && rowOf[p] !== undefined).map(p => {
            const x1 = x(fc[p].finish) + dayW, y1 = barY(p, planned.findIndex(q => q.id === p)), x2 = x(f.start), mid = (x1 + x2) / 2
            return <path key={p} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y}, ${x2} ${y}`} fill="none" stroke={tone(f)} strokeWidth="1.2" opacity=".7" />
          })}
        </g>
      })}
      <line x1={x(today)} x2={x(today)} y1={TOP - 4} y2={H - 22} stroke="var(--ink)" strokeWidth="1.5" />
      <text x={x(today) + 4} y={H - 8} fontSize="11" fill="var(--ink-2)">today</text>
      {p.deadline && <><line x1={x(p.deadline)} x2={x(p.deadline)} y1={TOP - 4} y2={H - 22} stroke={STATUS.caution} strokeWidth="2" />
        <text x={x(p.deadline) - 4} y={H - 8} fontSize="11" textAnchor="end" fill={STATUS.caution}>{p.deadlineLabel}</text></>}
    </svg>
  )
}

// ── the plan ──────────────────────────────────────────────────────────
/** What the plan skips, the holidays inside it, and the days off, editable here since this is where they matter. */
function DaysOff({ d, onChanged }) {
  const [open, setOpen] = useState(false)
  const [region, setRegion] = useState(d.holidayRegion || 'ZH')
  const [text, setText] = useState(d.daysOffText || '')
  const [busy, setBusy] = useState(false)
  const inPlan = d.daysOff || []
  const save = async () => {
    setBusy(true)
    try { await saveSettings({ holidayRegion: region, daysOff: text }); toast('Planned again around the days off.', d.project.name); setOpen(false); onChanged() }
    catch (err) { toast('That did not work.', err.message) } finally { setBusy(false) }
  }
  return (
    <div className="mt-4 text-[13px]" style={{ color: 'var(--ink-3)' }}>
      <p className="leading-relaxed">
        Skips weekends and {REGION_LABEL[d.holidayRegion] || REGION_LABEL.ZH}{d.daysOffText ? ', plus your days off' : ''}.
        {inPlan.length > 0 && <> In this plan: <span className="tnum" style={{ color: 'var(--ink-2)' }}>{offRuns(inPlan)}</span>.</>}
        {' '}<button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="-my-1 inline-block py-1 underline underline-offset-2" style={{ color: 'var(--ink-2)' }}>{open ? 'Close' : 'Days off'}</button>
      </p>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
          <label className="block"><span className="text-[12.5px]">Public holidays</span>
            <select value={region} onChange={e => setRegion(e.target.value)} className={INP + ' mt-1 cursor-pointer'}>
              <option value="ZH">Canton Zurich</option><option value="CH">Swiss federal only</option><option value="none">None</option>
            </select></label>
          <label className="block"><span className="text-[12.5px]">Company days off, dates or ranges</span>
            <input value={text} onChange={e => setText(e.target.value)} placeholder="2026-12-24 to 2027-01-01, 2027-05-07" className={INP + ' mt-1 tnum'} /></label>
          <button type="button" onClick={save} disabled={busy} className={primary}>Save and plan again</button>
        </div>
      )}
    </div>
  )
}

/** The run of tasks that leaves the least room, from the first to the one it ends on. */
function Chain({ d }) {
  const chain = d.forecast?.chain || []
  if (!chain.length) return null
  const tight = chain.find(c => c.slack === d.forecast.slack) || chain.at(-1)
  return (
    <section className="panel p-6 sm:p-7" aria-label="What decides the date">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="display text-[22px] font-semibold leading-none">What decides the date.</h2>
        <span className="text-[13.5px]" style={{ color: roomTone(d.forecast.slack) }} data-volatile>{roomText(d.forecast.slack)}{tight.limit ? ` at ${tight.title}, due ${fmt(tight.limit)}` : ''}</span>
      </div>
      <p className="mt-1 max-w-[70ch] text-[13px]" style={{ color: 'var(--ink-3)' }}>Each task starts the working day after what it waits for is done. A part takes what is left of its lead time; anything else its size in planned days.</p>
      <ol className="mt-4 flex flex-col">
        {chain.map((c, i) => (
          <li key={c.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2" style={{ borderTop: '1px solid var(--line)' }} data-volatile>
            <span className="tnum w-5 text-[13px]" style={{ color: 'var(--ink-3)' }}>{i + 1}</span>
            <span className="min-w-[200px] flex-1 text-[14px]">{c.title}</span>
            <span className="tnum text-[13px]" style={{ color: 'var(--ink-2)' }}>{fmt(c.start)} to {fmt(c.finish)}, {plural(c.days, 'day')}</span>
            {c.slack !== null && <span className="tnum text-[13px]" style={{ color: roomTone(c.slack) }}>{roomText(c.slack)}</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

function Plan({ d, onChanged }) {
  const { project: p, slack, fit } = d
  const [phases, setPhases] = useState(() => p.phases.map(x => ({ id: x.id, name: x.name, days: x.days })))
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setPhases(p.phases.map(x => ({ id: x.id, name: x.name, days: x.days }))) }, [p.updatedAt])   // eslint-disable-line react-hooks/exhaustive-deps
  const slackOf = id => slack.perPhase.find(x => x.id === id)?.slack
  const fitOf = id => fit.find(x => x.id === id)
  // Every phase needs a name and a whole number of working days, 1 to 200; the first one that does not says so.
  const [bad, setBad] = useState(null)   // { i, what }
  const back = useRef(false)   // after Save or Cancel, Edit the phases takes focus again
  const done = () => { setEditing(false); setBad(null); back.current = true }
  const check = () => {
    const i = phases.findIndex(x => !String(x.name || '').trim() || !(Number.isInteger(Number(x.days)) && Number(x.days) >= 1 && Number(x.days) <= 200))
    if (i < 0) return true
    setBad({ i, what: !String(phases[i].name || '').trim() ? 'name' : 'days' })
    document.querySelector(`[aria-label="Phase ${i + 1} ${!String(phases[i].name || '').trim() ? 'name' : 'working days'}"]`)?.focus()
    return false
  }
  const save = async () => {
    if (busy || !check()) return
    setBusy(true)
    try { await patchProject(p.id, { phases: phases.map(x => ({ ...x, name: x.name.trim(), days: Number(x.days) })) }); toast('Planned again from the deadline.', p.name); done(); onChanged() }
    catch (err) { toast('That did not work.', err.message) } finally { setBusy(false) }
  }
  const write = async () => {
    setBusy(true)
    try { const r = await scheduleProject(p.id, true); toast(r.written ? `${plural(r.written, 'part')} got dates.` : 'Every part already has its dates.', p.name); refresh(); onChanged() }
    catch (err) { toast('That did not work.', err.message) } finally { setBusy(false) }
  }
  const total = phases.reduce((s, x) => s + (Number(x.days) || 0), 0)
  return (
    <section className="panel p-6 sm:p-7" aria-label="Plan">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="display text-[22px] font-semibold leading-none">The plan.</h2>
        <span className="tnum text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{plural(phases.length, 'phase')}, {plural(total, 'working day')}</span>
      </div>
      <ol className="mt-4 flex flex-col">
        {phases.map((ph, i) => {
          const live = p.phases.find(x => x.id === ph.id), s = slackOf(ph.id), f = fitOf(ph.id)
          return (
            <li key={ph.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-2 sm:grid-cols-[minmax(160px,1.4fr)_90px_1fr_1fr]" style={{ borderTop: '1px solid var(--line)' }}>
              {editing
                ? <input value={ph.name} aria-label={`Phase ${i + 1} name`} aria-invalid={(bad?.i === i && bad.what === 'name') || undefined} aria-describedby={bad?.i === i ? 'plan-phase-msg' : undefined} onChange={e => { setBad(null); setPhases(a => a.map((x, k) => k === i ? { ...x, name: e.target.value } : x)) }} className={INP} />
                : <span className="text-[14px]">{ph.name}</span>}
              {editing
                ? <input type="number" min="1" max="200" value={ph.days} aria-label={`Phase ${i + 1} working days`} aria-invalid={(bad?.i === i && bad.what === 'days') || undefined} aria-describedby={bad?.i === i ? 'plan-phase-msg' : undefined} onChange={e => { setBad(null); setPhases(a => a.map((x, k) => k === i ? { ...x, days: e.target.value } : x)) }} className={INP + ' tnum'} />
                : <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{plural(ph.days, 'day')}</span>}
              <span className="tnum text-[13px] sm:col-auto" style={{ color: 'var(--ink-3)' }} data-volatile>{live?.start ? `${fmt(live.start)} to ${fmt(live.end)}` : 'no dates'}</span>
              <span className="flex items-center gap-3 text-[13px]" data-volatile>
                {f && (f.hours > 0 || f.unsized > 0) && <span className="tnum" style={{ color: f.fits ? 'var(--ink-3)' : STATUS.overdue }} title={`${f.hours} h of sized work against ${f.capacity} h of planned time`}>{f.hours} of {f.capacity} h{f.unsized ? `, ${f.unsized} unsized` : ''}</span>}
                {s !== null && s !== undefined && <span style={{ color: roomTone(s) }}>{roomText(s)}</span>}
                {editing && <button type="button" onClick={() => setPhases(a => a.filter((_, k) => k !== i))} aria-label={`Remove ${ph.name}`} className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-full" style={{ color: 'var(--ink-3)' }}><Trash size={13} weight="bold" /></button>}
              </span>
            </li>
          )
        })}
      </ol>
      <DaysOff d={d} onChanged={onChanged} />
      {editing && bad && <p id="plan-phase-msg" role="alert" className="mt-4 text-[13px]" style={{ color: 'var(--caution)' }}>
        {bad.what === 'name' ? `Phase ${bad.i + 1} needs a name.` : `Phase ${bad.i + 1} takes a whole number of working days, 1 to 200.`}
      </p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {editing ? <>
          <button onClick={() => setPhases(a => [...a, { id: crypto.randomUUID(), name: `Phase ${a.length + 1}`, days: 5 }])} className={quiet}><Plus size={13} weight="bold" /> Phase</button>
          <button onClick={save} disabled={busy || !phases.length} className={primary}>Save and plan backwards</button>
          <button onClick={() => { done(); setPhases(p.phases.map(x => ({ id: x.id, name: x.name, days: x.days }))) }} className={ghost}>Cancel</button>
        </> : <>
          <button ref={el => { if (el && back.current) { back.current = false; el.focus({ preventScroll: true }) } }} onClick={() => setEditing(true)} className={quiet}><PencilSimple size={13} weight="bold" /> Edit the phases</button>
          <button onClick={write} disabled={busy || !p.deadline} className={primary} title="Need-by and order-by onto every part with a supplier that is not ordered yet"><ArrowsClockwise size={13} weight="bold" /> Write the dates onto the parts</button>
        </>}
      </div>
    </section>
  )
}

function Orders({ orders, today }) {
  if (!orders.length) return null
  return (
    <section className="panel p-6 sm:p-7" aria-label="Parts to order">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="display text-[22px] font-semibold leading-none">Parts to order.</h2>
        <span className="tnum text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{plural(orders.length, 'part')} with a supplier and no order yet</span>
      </div>
      <ul className="mt-4 flex flex-col">
        {orders.map(o => {
          const lateOrder = o.orderBy && o.orderBy < today
          return (
            <li key={o.taskId} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2" style={{ borderTop: '1px solid var(--line)' }} data-volatile>
              <span className="min-w-[200px] flex-1 text-[14px]">{o.title}</span>
              <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{o.supplier}</span>
              <span className="tnum text-[13px]" style={{ color: lateOrder ? STATUS.overdue : 'var(--ink-2)' }}>order by {fmt(o.orderBy)}{o.days !== null ? `, ${o.days} days ${o.basis === 'learned' ? 'usually' : 'guessed'}` : ''}</span>
              <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>for {fmt(o.needBy)}{o.current && o.current !== o.orderBy ? `, on the task: ${fmt(o.current)}` : ''}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function TaskRow({ t, phases, onMove, today, all = [], forecast = {}, onAfter }) {
  const due = (t.dueDate || '').slice(0, 10)
  const after = (t.after || []).filter(id => all.some(x => x.id === id))
  const f = forecast[t.id]
  const choices = all.filter(x => x.id !== t.id && !after.includes(x.id) && !x.done)
  const title = id => all.find(x => x.id === id)?.title || 'a task'
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2" style={{ borderTop: '1px solid var(--line)' }}>
      <span className="min-w-[200px] flex-1 text-[14px]" style={{ color: t.done ? 'var(--ink-3)' : 'var(--ink)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</span>
      <span className="tnum text-[13px]" style={{ color: due && due < today && !t.done ? STATUS.overdue : 'var(--ink-3)' }} data-volatile>{[due ? `due ${fmt(due)}` : null, t.effortHours ? `${t.effortHours} h` : null, t.supplier].filter(Boolean).join(', ')}</span>
      <select value={t.phase || ''} onChange={e => onMove(t.id, e.target.value || null)} aria-label={`Phase of ${t.title}`} className="field px-2 py-1 text-[12.5px]">
        <option value="">no phase</option>
        {phases.map(ph => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
      </select>
      {!t.done && choices.length > 0 && (
        <select value="" onChange={e => e.target.value && onAfter(t.id, [...after, e.target.value])} aria-label={`${t.title} waits for`} className="field px-2 py-1 text-[12.5px]">
          <option value="">waits for…</option>
          {choices.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
      )}
      {(after.length > 0 || (f && !f.done)) && (
        <div className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1 pl-0.5 text-[12.5px]" data-volatile>
          {after.map(id => (
            <span key={id} className="inline-flex items-center gap-1 rounded-[4px] py-0.5 pl-2 pr-0.5" style={{ background: 'var(--wash)', color: 'var(--ink-2)' }}>
              after {title(id)}
              <button type="button" onClick={() => onAfter(t.id, after.filter(x => x !== id))} aria-label={`${t.title} no longer waits for ${title(id)}`} className="inline-grid h-6 w-6 place-items-center rounded-[4px]" style={{ color: 'var(--ink-3)' }}><X size={11} weight="bold" /></button>
            </span>
          ))}
          {f && !f.done && <span className="tnum" style={{ color: roomTone(f.slack) }}>done by {fmt(f.finish)}{f.slack !== null ? `, ${roomText(f.slack)}` : ''}</span>}
        </div>
      )}
    </li>
  )
}

function ProjectDetail({ id, onBack }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)
  const loaded = useRef(false)
  // A refresh that fails once the page is up keeps what is on screen; only a first load that fails says so.
  const load = useCallback(() => getProject(id).then(x => { loaded.current = true; setD(x); setError(null) })
    .catch(err => { if (!loaded.current || err.message === 'not found') setError(err.message) }), [id])
  useEffect(() => { load(); addEventListener('bench:refresh', load); return () => removeEventListener('bench:refresh', load) }, [load])
  const [editHead, setEditHead] = useState(false)
  const [head, setHead] = useState(null)
  const [headBusy, setHeadBusy] = useState(false)
  const [headErr, setHeadErr] = useState(null)
  if (error) return <main className="mx-auto col px-6"><p className="text-[14px]" style={{ color: 'var(--ink-3)' }}>{error === 'not found' ? 'That project is gone.' : `The project did not load: ${error}.`} {error !== 'not found' && <><button onClick={() => { setError(null); load() }} className="-my-[3px] inline-block py-[3px] underline underline-offset-2">Try again</button> or </>}<button onClick={onBack} className="-my-[3px] inline-block py-[3px] underline underline-offset-2">{error === 'not found' ? 'Back to the list' : 'back to the list'}</button></p></main>
  if (!d) return <main className="mx-auto col px-6"><PanelSkeleton /></main>
  const { project: p, phases, unassigned, slack, today } = d
  const move = async (taskId, phase) => { try { await assignPhase(p.id, taskId, phase); refresh(); load() } catch (err) { toast('That did not work.', err.message) } }
  const setAfter = async (taskId, after) => { try { await patchTask(taskId, { after }); refresh(); load() } catch (err) { toast('That did not work.', err.message) } }
  const all = [...phases.flatMap(ph => ph.tasks), ...unassigned]
  const room = roomOf(d)
  const row = t => <TaskRow key={t.id} t={t} phases={p.phases} onMove={move} today={today} all={all} forecast={d.forecast?.tasks || {}} onAfter={setAfter} />
  const saveHead = async () => {
    if (headBusy) return
    if (!String(head.name || '').trim()) { setHeadErr('A project needs a name.'); return }
    setHeadBusy(true)
    try { await patchProject(p.id, head); setEditHead(false); setHeadErr(null); toName(); toast('Saved.', head.name); load(); refresh() } catch (err) { toast('That did not work.', err.message) } finally { setHeadBusy(false) }
  }
  // Save and Cancel take the fields away; focus goes to the project's name instead of the top of the page.
  const toName = () => setTimeout(() => { const h = document.querySelector('main h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }) } }, 0)
  const cancelHead = () => { setEditHead(false); setHeadErr(null); toName() }
  const remove = async () => {
    if (!(await ask(`Delete the project "${p.name}"? Its tasks stay on the board, only the plan goes.`))) return
    try { await removeProject(p.id); toast('Deleted.', p.name); onBack() } catch (err) { toast('That did not work.', err.message) }
  }
  const openTasks = phases.reduce((s, ph) => s + ph.tasks.filter(t => !t.done).length, 0) + unassigned.filter(t => !t.done).length
  return (
    <main className="mx-auto col flex flex-col gap-4 px-6">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className={ghost}><ArrowLeft size={13} weight="bold" /> All projects</button>
        <a href={`#/machines?m=${encodeURIComponent(p.machine.toLowerCase())}`} className="text-[13px] underline underline-offset-2" style={{ color: 'var(--ink-3)' }}>The machine page</a>
      </div>

      <section className="panel p-6 sm:p-7" aria-label="Project">
        {editHead ? (
          <div className="grid gap-3 sm:grid-cols-2" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancelHead() } else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); saveHead() } }}>
            <label className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Name</span><input autoFocus value={head.name} onChange={e => { setHeadErr(null); setHead(h => ({ ...h, name: e.target.value })) }} aria-invalid={Boolean(headErr) || undefined} aria-describedby={headErr ? 'project-name-msg' : undefined} className={INP + ' mt-1'} />
              {headErr && <span id="project-name-msg" role="alert" className="mt-1 block text-[12.5px]" style={{ color: 'var(--caution)' }}>{headErr}</span>}</label>
            <label className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Machine</span><input value={head.machine} onChange={e => setHead(h => ({ ...h, machine: e.target.value }))} className={INP + ' mt-1'} /></label>
            <div className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>The date that matters</span><DateField className="mt-1" value={head.deadline || ''} onChange={v => setHead(h => ({ ...h, deadline: v || null }))} /></div>
            <label className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>What that date is</span><select value={head.deadlineLabel} onChange={e => setHead(h => ({ ...h, deadlineLabel: e.target.value }))} className={INP + ' mt-1 cursor-pointer'}>{LABELS.map(l => <option key={l}>{l}</option>)}</select></label>
            <label className="block sm:col-span-2"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Goal</span><input value={head.goal} onChange={e => setHead(h => ({ ...h, goal: e.target.value }))} className={INP + ' mt-1'} /></label>
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <button onClick={saveHead} disabled={headBusy} aria-busy={headBusy || undefined} className={primary}>Save</button>
              <button onClick={cancelHead} className={ghost}>Cancel</button>
              <button onClick={remove} className={ghost + ' ml-auto'} style={{ color: STATUS.overdue }}><Trash size={13} weight="bold" /> Delete the project</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h1 className="display text-[32px] font-semibold leading-none sm:text-[40px]">{p.name}.</h1>
              <button onClick={() => { setHead({ name: p.name, machine: p.machine, goal: p.goal, deadline: p.deadline, deadlineLabel: p.deadlineLabel }); setEditHead(true) }} className={quiet}><PencilSimple size={13} weight="bold" /> Edit</button>
            </div>
            {p.goal && <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{p.goal}</p>}
            <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4" data-volatile>
              <Figure value={p.deadline ? fmt(p.deadline) : 'none'} label={p.deadline ? `${p.deadlineLabel}, ${fmtLong(p.deadline)}` : 'no deadline yet'} tone={p.deadline && p.deadline < today ? STATUS.overdue : 'var(--accent)'} />
              <Figure value={room === null ? 'open' : room} label={room === null ? 'nothing dated yet' : room < 0 ? 'working days behind' : 'working days of room'} tone={roomTone(room)} />
              <Figure value={openTasks} label={openTasks === 1 ? 'open task' : 'open tasks'} />
              <Figure value={slack.late.length} label={slack.late.length === 1 ? 'task late' : 'tasks late'} tone={slack.late.length ? STATUS.overdue : undefined} />
            </div>
          </>
        )}
      </section>

      <section className="panel p-6 sm:p-7" aria-label="Timeline">
        <h2 className="display text-[22px] font-semibold leading-none">The timeline.</h2>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>Phases as bands, due dates as dots, dashed runs are lead times from order-by to need-by. Thin bars are the forecast for tasks that wait for others; shaded days are holidays and days off.</p>
        <div className="mt-4"><Timeline d={d} /></div>
      </section>

      <Chain d={d} />

      <Plan d={d} onChanged={load} />
      <Orders orders={d.orders} today={today} />

      <section className="panel p-6 sm:p-7" aria-label="Tasks by phase">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="display text-[22px] font-semibold leading-none">The work, by phase.</h2>
          <span className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Every task whose project reads "{p.machine}". Give each a phase, and say what it waits for; new tasks join through Quick add with that project.</span>
        </div>
        {phases.map(ph => (
          <div key={ph.id} className="mt-5">
            <h3 className="text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>{ph.name}{ph.start ? <span className="tnum ml-2" data-volatile>{fmt(ph.start)} to {fmt(ph.end)}</span> : null}</h3>
            {ph.tasks.length ? <ul className="mt-1 flex flex-col">{ph.tasks.map(row)}</ul>
              : <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-3)', borderTop: '1px solid var(--line)', paddingTop: 8 }}>Pick this phase on a task below to put it here.</p>}
          </div>
        ))}
        <div className="mt-5">
          <h3 className="text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>No phase yet</h3>
          {unassigned.length ? <ul className="mt-1 flex flex-col">{unassigned.map(row)}</ul>
            : <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-3)', borderTop: '1px solid var(--line)', paddingTop: 8 }}>Every task on {p.machine} sits in a phase.</p>}
        </div>
      </section>
    </main>
  )
}

const Figure = ({ value, label, tone }) => (
  <div>
    <div className="display tnum text-[28px] font-semibold leading-none sm:text-[32px]" style={{ color: tone || 'var(--ink)' }}>{value}</div>
    <div className="mt-1.5 text-[13px]" style={{ color: 'var(--ink-3)' }}>{label}</div>
  </div>
)

export default function Projects() {
  const [id, setId] = useState(idFromHash)
  const [code, setCode] = useState(codeFromHash)
  const [items, setItems] = useState(null)
  const [machines, setMachines] = useState([])
  const [listErr, setListErr] = useState(null)
  useEffect(() => {
    const on = () => { setId(idFromHash()); setCode(codeFromHash()) }
    addEventListener('hashchange', on); return () => removeEventListener('hashchange', on)
  }, [])
  // A list that did not load is not an empty list: say so, and keep what was on screen when a refresh fails.
  const had = useRef(false)
  const load = useCallback(() => getProjects().then(x => { had.current = true; setItems(x); setListErr(null) })
    .catch(err => { if (!had.current) setListErr(err.message) }), [])
  // List and detail share one route, so App's focus-follows-the-route never fires between them. Opening a
  // project puts focus on its name; going back puts it on the card you came from.
  const shown = useRef(id)
  useEffect(() => {
    const was = shown.current
    shown.current = id
    if (was === id) return
    let tries = 0
    const t = setInterval(() => {
      tries++
      const el = id ? document.querySelector('main h1')
        : (was && document.querySelector(`a[href="#/projects?p=${encodeURIComponent(was)}"]`)) || (tries > 10 ? document.querySelector('header h1') : null)
      if (el) { if (el.tagName === 'H1') el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: Boolean(id) }); clearInterval(t) }
      else if (tries > 40) clearInterval(t)
    }, 50)
    return () => clearInterval(t)
  }, [id])
  useEffect(() => { load(); addEventListener('bench:refresh', load); return () => removeEventListener('bench:refresh', load) }, [load])
  useEffect(() => { getMachines().then(ms => setMachines((Array.isArray(ms) ? ms : []).map(m => m.name).filter(Boolean))).catch(() => {}) }, [])
  const sorted = useMemo(() => (items || []).slice(), [items])
  if (id) return <ProjectDetail id={id} onBack={() => { setHash(null); load() }} />
  if (code) return <InnovationDetail code={code} onBack={() => { location.hash = '#/projects' }} />
  return (
    <main className="mx-auto col flex flex-col gap-4 px-6">
      <InnovationList />
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="display text-[22px] font-semibold leading-none">Plans.</h2>
        <NewProject machines={machines} onCreated={(p) => { load(); setHash(p.id) }} />
      </div>
      {items === null ? (listErr ? <LoadFailed title="The projects did not load." message={`${listErr}. Nothing is lost; Try again asks for them once more.`} onRetry={() => { setListErr(null); load() }} /> : <PanelSkeleton />) : sorted.length ? <div className="grid gap-4 md:grid-cols-2">{sorted.map(p => <ProjectCard key={p.id} p={p} />)}</div>
        : <p className="max-w-[60ch] text-[14px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>No plan yet. A plan is a machine or an innovation project, the one date that matters and the phases before it; the dates fall out of the deadline. On an innovation project, Plan it back from a date starts one with the five stages.</p>}
    </main>
  )
}
