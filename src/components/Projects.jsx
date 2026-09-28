import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, Trash, ArrowsClockwise, PencilSimple } from '@phosphor-icons/react'
import { getProjects, getProject, createProject, patchProject, removeProject, scheduleProject, assignPhase } from '../api/projects.js'
import { getMachines } from '../api/machines.js'
import DateField from './DateField.jsx'
import { PanelSkeleton } from './Skeleton.jsx'
import { STATUS } from '../scenes.js'

/**
 * Projects (roadmap 121 to 125): one page that plans a machine. A project is a goal, a machine, the one date
 * that matters and the phases in order before it. The dates fall out of the deadline: the last phase ends on
 * it, every phase before ends the working day before the next begins. Tasks join a phase through their
 * project text and a phase select; parts with a supplier get an order-by date from the learned lead times.
 * The timeline, the slack and the fit are read from that, nothing is typed twice. #/projects?p=<id> opens one.
 */
const toast = (text, by) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true } }))
const refresh = () => window.dispatchEvent(new Event('bench:refresh'))
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const btn = 'pill inline-flex min-h-[32px] items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-50'
const quiet = { background: 'var(--row)', border: '1px solid var(--line)', color: 'var(--ink-2)' }
const primary = { background: 'var(--accent)', color: 'var(--accent-ink)' }
const INP = 'w-full rounded-[10px] px-3 py-2 text-[14px] outline-none focus:ring-2'
const inpStyle = { background: 'var(--row)', border: '1px solid var(--line)', color: 'var(--ink)' }
const LABELS = ['FAT', 'Delivery', 'Handover', 'Milestone']
const idFromHash = () => new URLSearchParams(location.hash.split('?')[1] || '').get('p')
const setHash = (id) => { location.hash = id ? `#/projects?p=${encodeURIComponent(id)}` : '#/projects' }
const noon = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00')
const fmt = iso => iso ? noon(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
const fmtLong = iso => iso ? noon(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : ''
const dayIndex = (iso, from) => Math.round((noon(iso) - noon(from)) / 86400000)
const roomText = (slack) => slack === null || slack === undefined ? 'no dated work yet'
  : slack < 0 ? `${plural(-slack, 'working day')} behind the plan` : slack === 0 ? 'no room left' : `${plural(slack, 'working day')} of room`
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
  const [f, setF] = useState({ name: '', machine: '', goal: '', deadline: '', deadlineLabel: 'FAT' })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    if (!f.name.trim()) return
    setBusy(true)
    try {
      const p = await createProject({ ...f, machine: f.machine.trim() || f.name.trim() })
      toast('Planned from the deadline.', p.name); setOpen(false); setF({ name: '', machine: '', goal: '', deadline: '', deadlineLabel: 'FAT' }); onCreated(p)
    } catch (err) { toast('That did not work.', err.message) } finally { setBusy(false) }
  }
  if (!open) return <button onClick={() => setOpen(true)} className={btn} style={primary}><Plus size={13} weight="bold" /> New project</button>
  return (
    <form onSubmit={submit} className="panel grid gap-3 p-6 sm:grid-cols-2" aria-label="New project">
      <label className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Name</span>
        <input autoFocus value={f.name} onChange={e => set('name', e.target.value)} placeholder="Leg press 7" className={INP + ' mt-1'} style={inpStyle} /></label>
      <label className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Machine, as tasks name it in Project</span>
        <input list="project-machines" autoComplete="off" value={f.machine} onChange={e => set('machine', e.target.value)} placeholder="same as the name when empty" className={INP + ' mt-1'} style={inpStyle} />
        <datalist id="project-machines">{machines.map(m => <option key={m} value={m} />)}</datalist></label>
      <div className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>The date that matters</span>
        <DateField className="mt-1" value={f.deadline} onChange={v => set('deadline', v || '')} placeholder="pick the day" /></div>
      <label className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>What that date is</span>
        <select value={f.deadlineLabel} onChange={e => set('deadlineLabel', e.target.value)} className={INP + ' mt-1 cursor-pointer'} style={inpStyle}>{LABELS.map(l => <option key={l}>{l}</option>)}</select></label>
      <label className="block sm:col-span-2"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Goal, one sentence</span>
        <input value={f.goal} onChange={e => set('goal', e.target.value)} placeholder="Runs the full test protocol before the customer arrives." className={INP + ' mt-1'} style={inpStyle} /></label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={busy || !f.name.trim()} className={btn} style={primary}>Create and plan</button>
        <button type="button" onClick={() => setOpen(false)} className={btn} style={quiet}>Cancel</button>
        <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Seven phases to start with, Design to Handover. Change them on the next page.</span>
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
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Timeline of the phases" data-volatile style={{ fontFamily: 'inherit' }}>
      {weeks.map(w => <g key={+w}><line x1={x(iso(w))} x2={x(iso(w))} y1={TOP - 6} y2={H - 24} stroke="rgba(var(--ink-rgb),.1)" />
        <text x={x(iso(w)) + 3} y={TOP - 10} fontSize="11" fill="var(--ink-3)">{fmt(iso(w))}</text></g>)}
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
      <line x1={x(today)} x2={x(today)} y1={TOP - 4} y2={H - 22} stroke="var(--ink)" strokeWidth="1.5" />
      <text x={x(today) + 4} y={H - 8} fontSize="11" fill="var(--ink-2)">today</text>
      {p.deadline && <><line x1={x(p.deadline)} x2={x(p.deadline)} y1={TOP - 4} y2={H - 22} stroke={STATUS.caution} strokeWidth="2" />
        <text x={x(p.deadline) - 4} y={H - 8} fontSize="11" textAnchor="end" fill={STATUS.caution}>{p.deadlineLabel}</text></>}
    </svg>
  )
}

// ── the plan ──────────────────────────────────────────────────────────
function Plan({ d, onChanged }) {
  const { project: p, slack, fit } = d
  const [phases, setPhases] = useState(() => p.phases.map(x => ({ id: x.id, name: x.name, days: x.days })))
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setPhases(p.phases.map(x => ({ id: x.id, name: x.name, days: x.days }))) }, [p.updatedAt])   // eslint-disable-line react-hooks/exhaustive-deps
  const slackOf = id => slack.perPhase.find(x => x.id === id)?.slack
  const fitOf = id => fit.find(x => x.id === id)
  const save = async () => {
    setBusy(true)
    try { await patchProject(p.id, { phases }); toast('Planned again from the deadline.', p.name); setEditing(false); onChanged() }
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
        <span className="tnum text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{plural(phases.length, 'phase')}, {plural(total, 'working day')}; weekends are skipped, holidays are not known here</span>
      </div>
      <ol className="mt-4 flex flex-col">
        {phases.map((ph, i) => {
          const live = p.phases.find(x => x.id === ph.id), s = slackOf(ph.id), f = fitOf(ph.id)
          return (
            <li key={ph.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-2 sm:grid-cols-[minmax(160px,1.4fr)_90px_1fr_1fr]" style={{ borderTop: '1px solid var(--line)' }}>
              {editing
                ? <input value={ph.name} aria-label={`Phase ${i + 1} name`} onChange={e => setPhases(a => a.map((x, k) => k === i ? { ...x, name: e.target.value } : x))} className={INP} style={inpStyle} />
                : <span className="text-[14px]">{ph.name}</span>}
              {editing
                ? <input type="number" min="1" max="200" value={ph.days} aria-label={`Phase ${i + 1} working days`} onChange={e => setPhases(a => a.map((x, k) => k === i ? { ...x, days: e.target.value } : x))} className={INP + ' tnum'} style={inpStyle} />
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
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {editing ? <>
          <button onClick={() => setPhases(a => [...a, { id: crypto.randomUUID(), name: `Phase ${a.length + 1}`, days: 5 }])} className={btn} style={quiet}><Plus size={13} weight="bold" /> Phase</button>
          <button onClick={save} disabled={busy || !phases.length} className={btn} style={primary}>Save and plan backwards</button>
          <button onClick={() => { setEditing(false); setPhases(p.phases.map(x => ({ id: x.id, name: x.name, days: x.days }))) }} className={btn} style={quiet}>Cancel</button>
        </> : <>
          <button onClick={() => setEditing(true)} className={btn} style={quiet}><PencilSimple size={13} weight="bold" /> Edit the phases</button>
          <button onClick={write} disabled={busy || !p.deadline} className={btn} style={primary} title="Need-by and order-by onto every part with a supplier that is not ordered yet"><ArrowsClockwise size={13} weight="bold" /> Write the dates onto the parts</button>
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

function TaskRow({ t, phases, onMove, today }) {
  const due = (t.dueDate || '').slice(0, 10)
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2" style={{ borderTop: '1px solid var(--line)' }}>
      <span className="min-w-[200px] flex-1 text-[14px]" style={{ color: t.done ? 'var(--ink-3)' : 'var(--ink)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</span>
      <span className="tnum text-[13px]" style={{ color: due && due < today && !t.done ? STATUS.overdue : 'var(--ink-3)' }} data-volatile>{[due ? `due ${fmt(due)}` : null, t.effortHours ? `${t.effortHours} h` : null, t.supplier].filter(Boolean).join(', ')}</span>
      <select value={t.phase || ''} onChange={e => onMove(t.id, e.target.value || null)} aria-label={`Phase of ${t.title}`} className="rounded-[10px] px-2 py-1 text-[12.5px]" style={inpStyle}>
        <option value="">no phase</option>
        {phases.map(ph => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
      </select>
    </li>
  )
}

function ProjectDetail({ id, onBack }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)
  const load = useCallback(() => getProject(id).then(setD).catch(err => setError(err.message)), [id])
  useEffect(() => { load(); addEventListener('bench:refresh', load); return () => removeEventListener('bench:refresh', load) }, [load])
  const [editHead, setEditHead] = useState(false)
  const [head, setHead] = useState(null)
  if (error) return <main className="mx-auto col px-6"><p className="text-[14px]" style={{ color: 'var(--ink-3)' }}>{error === 'not found' ? 'That project is gone.' : error} <button onClick={onBack} className="underline underline-offset-2">Back to the list</button></p></main>
  if (!d) return <main className="mx-auto col px-6"><PanelSkeleton /></main>
  const { project: p, phases, unassigned, slack, today } = d
  const move = async (taskId, phase) => { try { await assignPhase(p.id, taskId, phase); refresh(); load() } catch (err) { toast('That did not work.', err.message) } }
  const saveHead = async () => {
    try { await patchProject(p.id, head); setEditHead(false); load(); refresh() } catch (err) { toast('That did not work.', err.message) }
  }
  const remove = async () => {
    if (!confirm(`Delete the project "${p.name}"? Its tasks stay on the board, only the plan goes.`)) return
    try { await removeProject(p.id); toast('Deleted.', p.name); onBack() } catch (err) { toast('That did not work.', err.message) }
  }
  const openTasks = phases.reduce((s, ph) => s + ph.tasks.filter(t => !t.done).length, 0) + unassigned.filter(t => !t.done).length
  return (
    <main className="mx-auto col flex flex-col gap-6 px-6">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className={btn} style={quiet}><ArrowLeft size={13} weight="bold" /> All projects</button>
        <a href={`#/machines?m=${encodeURIComponent(p.machine.toLowerCase())}`} className="text-[13px] underline underline-offset-2" style={{ color: 'var(--ink-3)' }}>The machine page</a>
      </div>

      <section className="panel p-6 sm:p-7" aria-label="Project">
        {editHead ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Name</span><input value={head.name} onChange={e => setHead(h => ({ ...h, name: e.target.value }))} className={INP + ' mt-1'} style={inpStyle} /></label>
            <label className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Machine</span><input value={head.machine} onChange={e => setHead(h => ({ ...h, machine: e.target.value }))} className={INP + ' mt-1'} style={inpStyle} /></label>
            <div className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>The date that matters</span><DateField className="mt-1" value={head.deadline || ''} onChange={v => setHead(h => ({ ...h, deadline: v || null }))} /></div>
            <label className="block"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>What that date is</span><select value={head.deadlineLabel} onChange={e => setHead(h => ({ ...h, deadlineLabel: e.target.value }))} className={INP + ' mt-1 cursor-pointer'} style={inpStyle}>{LABELS.map(l => <option key={l}>{l}</option>)}</select></label>
            <label className="block sm:col-span-2"><span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Goal</span><input value={head.goal} onChange={e => setHead(h => ({ ...h, goal: e.target.value }))} className={INP + ' mt-1'} style={inpStyle} /></label>
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <button onClick={saveHead} className={btn} style={primary}>Save</button>
              <button onClick={() => setEditHead(false)} className={btn} style={quiet}>Cancel</button>
              <button onClick={remove} className={btn + ' ml-auto'} style={{ ...quiet, color: STATUS.overdue }}><Trash size={13} weight="bold" /> Delete the project</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h1 className="display text-[32px] font-semibold leading-none sm:text-[40px]">{p.name}.</h1>
              <button onClick={() => { setHead({ name: p.name, machine: p.machine, goal: p.goal, deadline: p.deadline, deadlineLabel: p.deadlineLabel }); setEditHead(true) }} className={btn} style={quiet}><PencilSimple size={13} weight="bold" /> Edit</button>
            </div>
            {p.goal && <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{p.goal}</p>}
            <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4" data-volatile>
              <Figure value={p.deadline ? fmt(p.deadline) : 'none'} label={p.deadline ? `${p.deadlineLabel}, ${fmtLong(p.deadline)}` : 'no deadline yet'} tone={p.deadline && p.deadline < today ? STATUS.overdue : 'var(--accent)'} />
              <Figure value={slack.slack === null ? 'open' : slack.slack} label={slack.slack === null ? 'nothing dated yet' : slack.slack < 0 ? 'working days behind' : 'working days of room'} tone={roomTone(slack.slack)} />
              <Figure value={openTasks} label={openTasks === 1 ? 'open task' : 'open tasks'} />
              <Figure value={slack.late.length} label={slack.late.length === 1 ? 'task late' : 'tasks late'} tone={slack.late.length ? STATUS.overdue : undefined} />
            </div>
          </>
        )}
      </section>

      <section className="panel p-6 sm:p-7" aria-label="Timeline">
        <h2 className="display text-[22px] font-semibold leading-none">The timeline.</h2>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>Phases as bands, due dates as dots, the dashed runs are lead times from order-by to need-by.</p>
        <div className="mt-4"><Timeline d={d} /></div>
      </section>

      <Plan d={d} onChanged={load} />
      <Orders orders={d.orders} today={today} />

      <section className="panel p-6 sm:p-7" aria-label="Tasks by phase">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="display text-[22px] font-semibold leading-none">The work, by phase.</h2>
          <span className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Every task whose project reads "{p.machine}". Pick a phase on each; new tasks join through Quick add with that project.</span>
        </div>
        {phases.map(ph => (
          <div key={ph.id} className="mt-5">
            <h3 className="text-[13px] font-medium uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>{ph.name}{ph.start ? <span className="tnum ml-2 normal-case tracking-normal" data-volatile>{fmt(ph.start)} to {fmt(ph.end)}</span> : null}</h3>
            {ph.tasks.length ? <ul className="mt-1 flex flex-col">{ph.tasks.map(t => <TaskRow key={t.id} t={t} phases={p.phases} onMove={move} today={today} />)}</ul>
              : <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-3)', borderTop: '1px solid var(--line)', paddingTop: 8 }}>Nothing here yet.</p>}
          </div>
        ))}
        <div className="mt-5">
          <h3 className="text-[13px] font-medium uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>No phase yet</h3>
          {unassigned.length ? <ul className="mt-1 flex flex-col">{unassigned.map(t => <TaskRow key={t.id} t={t} phases={p.phases} onMove={move} today={today} />)}</ul>
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
  const [items, setItems] = useState(null)
  const [machines, setMachines] = useState([])
  useEffect(() => {
    const on = () => setId(idFromHash())
    addEventListener('hashchange', on); return () => removeEventListener('hashchange', on)
  }, [])
  const load = useCallback(() => getProjects().then(setItems).catch(() => setItems([])), [])
  useEffect(() => { load(); addEventListener('bench:refresh', load); return () => removeEventListener('bench:refresh', load) }, [load])
  useEffect(() => { getMachines().then(ms => setMachines((Array.isArray(ms) ? ms : []).map(m => m.name).filter(Boolean))).catch(() => {}) }, [])
  const sorted = useMemo(() => (items || []).slice(), [items])
  if (id) return <ProjectDetail id={id} onBack={() => { setHash(null); load() }} />
  return (
    <main className="mx-auto col flex flex-col gap-6 px-6">
      <div className="flex flex-wrap items-center gap-3"><NewProject machines={machines} onCreated={(p) => { load(); setHash(p.id) }} /></div>
      {items === null ? <PanelSkeleton /> : sorted.length ? <div className="grid gap-4 md:grid-cols-2">{sorted.map(p => <ProjectCard key={p.id} p={p} />)}</div>
        : <p className="max-w-[60ch] text-[14px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>No project yet. A project is a machine, the one date that matters and the phases before it; the dates fall out of the deadline. Tasks whose project reads the machine's name join by themselves.</p>}
    </main>
  )
}
