import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Check, X, BellSimple, ArrowSquareOut, Plus } from '@phosphor-icons/react'
import { openExternal } from '../api.js'
import DateField from './DateField.jsx'
import { presets, remindLabel, toLocalInput, fromLocalInput } from '../remind.js'
import { getProjects } from '../api/projects.js'
import { STATUS } from '../scenes.js'
import { fmtDate } from '../lanes.js'
import { suggestOrderBy } from '../api/leadtimes.js'
import { getMachines } from '../api/machines.js'
import { getPortfolio } from '../api/portfolio.js'

const L = ({ label, children, span }) => (
  <label className={`block min-w-0 text-[13px] ${span ? 'col-span-full' : ''}`} style={{ color: 'var(--ink-3)' }}>{label}{children}</label>
)
/**
 * One group of fields. The grid follows the width of the lane, not the window (roadmap 146): one column in a
 * very narrow lane, two in a normal one, four in a wide one, so labels never wrap and dates are never cut.
 */
const Group = ({ title, children }) => (
  <section className="mt-4 first:mt-0" aria-label={title}>
    <h4 className="text-[13px] font-semibold" style={{ color: 'var(--ink-2)' }}>{title}</h4>
    <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-3 @xs:grid-cols-2 @2xl:grid-cols-4">{children}</div>
  </section>
)
/** Where a synced task lives, for "Open in ..." and the footer line. */
const SOURCE = { planner: 'Planner', issues: 'Issues', qms: 'the QMS', bom: 'the BOM', innovation: 'the Innovation dashboard' }
const INP = 'field mt-1 w-full px-2 py-1.5 text-[13px]'
const PRIO = [[null, 'None'], [1, 'P1 now'], [2, 'P2 this week'], [3, 'P3 when there is room']]
const REPEAT = [[null, 'Does not repeat'], ['daily', 'Every day'], ['weekly', 'Every week'], ['fortnightly', 'Every two weeks'], ['monthly', 'Every month']]

/** Steps inside the task. Enter adds, the tick ticks, the cross removes. Saved as a whole list. */
function ChecklistEditor({ task, onPatch }) {
  const list = task.checklist || []
  const [text, setText] = useState('')
  const set = (next) => onPatch(task.id, { checklist: next })
  const add = () => { if (!text.trim()) return; set([...list, { text: text.trim() }]); setText('') }
  return (
    <div className="col-span-full">
      <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Checklist{list.length ? <span className="tnum"> · {list.filter(c => c.done).length} of {list.length}</span> : null}</span>
      <ul className="mt-1 flex flex-col gap-1">
        {list.map(c => (
          <li key={c.id} className="flex items-center gap-2">
            <button role="checkbox" aria-checked={c.done} aria-label={`${c.done ? 'Untick' : 'Tick'} ${c.text}`} onClick={() => set(list.map(x => x.id === c.id ? { ...x, done: !x.done } : x))}
              className="-m-[5px] grid h-6 w-6 shrink-0 place-items-center">
              <span className="grid h-[14px] w-[14px] place-items-center rounded-[4px] border" style={{ borderColor: c.done ? STATUS.done : 'var(--line-2)', background: c.done ? STATUS.done : 'transparent' }}>
                {c.done && <Check size={9} weight="bold" color="var(--bg)" />}
              </span>
            </button>
            <span className="flex-1 text-[13px]" style={{ color: c.done ? 'var(--ink-3)' : 'var(--ink)', textDecoration: c.done ? 'line-through' : 'none' }}>{c.text}</span>
            <button onClick={() => set(list.filter(x => x.id !== c.id))} aria-label={`Remove ${c.text}`} className="grid h-6 w-6 place-items-center rounded-[4px]" style={{ color: 'var(--ink-3)' }}><X size={11} weight="bold" /></button>
          </li>
        ))}
      </ul>
      <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} onBlur={add}
        placeholder={list.length ? 'Another step' : 'First step, then Enter'} className={INP} />
    </div>
  )
}

/**
 * What the supplier usually takes, as one line under the order fields (roadmap 70). Shown when the task
 * has a supplier and a due date but no order-by date yet; "Use it" writes the suggested date.
 */
function LeadTimeHint({ task, onPatch }) {
  const [hint, setHint] = useState(null)
  const supplier = (task.supplier || '').trim(), needBy = (task.dueDate || '').slice(0, 10)
  const wanted = Boolean(supplier && needBy && !task.orderBy)
  useEffect(() => {
    if (!wanted) { setHint(null); return }
    let on = true
    suggestOrderBy(supplier, needBy).then(s => { if (on) setHint(s && s.orderBy ? s : null) }).catch(() => { if (on) setHint(null) })
    return () => { on = false }
  }, [wanted, supplier, needBy])
  if (!wanted || !hint) return null
  const when = fmtDate(hint.orderBy)
  const line = hint.basis === 'default'
    ? `No history for ${supplier} yet; ${hint.days} working days is the guess: order by ${when}.`
    : `${supplier} usually takes ${hint.days} days: order by ${when}.`
  return (
    <div className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" style={{ color: 'var(--ink-2)' }}>
      <span>{line}</span>
      <button type="button" onClick={() => onPatch(task.id, { orderBy: hint.orderBy })} className="pill btn-quiet inline-flex h-6 items-center px-2.5 text-[12.5px] font-medium">Use it</button>
    </div>
  )
}

/**
 * Remind me (roadmap 150): in an hour, this afternoon at 14:00, tomorrow at 08:30, or a picked day and time.
 * At that time one desktop notification says "Reminder." with the title; a click opens the Board. Clear takes it off.
 */
const CHIP = 'pill btn-quiet inline-flex h-6 items-center px-2.5 text-[12.5px] font-medium'
function RemindMe({ task, onPatch }) {
  const [picking, setPicking] = useState(false)
  const [custom, setCustom] = useState('')
  const set = (iso) => { onPatch(task.id, { remindAt: iso }); setPicking(false); setCustom('') }
  const picked = fromLocalInput(custom)
  const future = picked && new Date(picked) > new Date()
  const choose = !task.remindAt || picking
  return (
    <div className="col-span-full">
      <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Remind me</span>
      {task.remindAt && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="mr-1 inline-flex items-center gap-1.5 tnum" style={{ color: 'var(--ink)' }}><BellSimple size={12} weight="bold" style={{ color: 'var(--accent)' }} />{remindLabel(task.remindAt)}</span>
          <button type="button" onClick={() => setPicking(v => !v)} aria-expanded={picking} className={CHIP}>Change</button>
          <button type="button" onClick={() => set(null)} aria-label="Clear the reminder" className="pill btn-ghost inline-flex h-6 items-center px-2.5 text-[12.5px] font-medium">Clear</button>
        </div>
      )}
      {choose && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {presets().map(p => <button key={p.key} type="button" onClick={() => set(p.iso)} className={CHIP}>{p.label}</button>)}
          <input type="datetime-local" aria-label="Pick a day and time" value={custom} min={toLocalInput(new Date().toISOString())}
            onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && future) { e.preventDefault(); set(picked) } }}
            className="field h-6 px-2 text-[12.5px] tnum" />
          <button type="button" onClick={() => set(picked)} disabled={!future} title={custom && !future ? 'Pick a time that is still ahead' : undefined} className={CHIP}>Set</button>
        </div>
      )}
    </div>
  )
}

/**
 * The full set of fields for one task, opened from the card. Saves on blur and on Enter,
 * so there is no Save button to forget. Escape closes.
 */
export default function TaskEditor({ task, onPatch, onClose, toolbar = null }) {
  const [f, setF] = useState(() => draft(task))
  // Machine as a field (roadmap 105): the known machines feed the Project input's list; free text still goes.
  const [machines, setMachines] = useState([])
  const [machineOffered, setMachineOffered] = useState(true)
  useEffect(() => {
    let on = true
    Promise.all([getMachines().catch(() => []), getPortfolio().then(d => (d?.projects || []).filter(p => !p.done).map(p => p.title)).catch(() => [])])
      .then(([ms, innov]) => { if (on) setMachines([...new Set([...innov, ...(Array.isArray(ms) ? ms : []).map(m => m.name).filter(Boolean)])]) })   // innovation projects first (roadmap 143)
    return () => { on = false }
  }, [])
  // The project's phases, when the project text names a planned machine (roadmap 121).
  const [projects, setProjects] = useState([])
  useEffect(() => { let on = true; getProjects().then(ps => { if (on) setProjects(Array.isArray(ps) ? ps : []) }).catch(() => {}); return () => { on = false } }, [])
  const planned = projects.find(p => (p.machine || '').trim().toLowerCase() === (task.project || '').trim().toLowerCase() && (p.phases || []).length)
  // A BOM task knows its machine; offer it once while the project is empty.
  const useMachine = machineOffered && task.source === 'bom' && task.meta?.machine && !task.project ? task.meta.machine : null
  useEffect(() => { setF(draft(task)) }, [task.id, task.updatedAt])   // eslint-disable-line react-hooks/exhaustive-deps
  // A field that cannot take what was typed puts the saved value back and says why, under the field.
  const [bad, setBad] = useState(null)   // { k, text }
  const set = (k, v) => { setF(s => ({ ...s, [k]: v })); if (bad?.k === k) setBad(null) }
  const commit = (k) => {
    const value = f[k]
    const current = k === 'tags' ? (task.tags || []).join(', ') : (task[k] ?? '')
    if (String(value ?? '') === String(current ?? '')) return
    // An emptied title would save as no title at all; a negative or unreadable effort is not hours.
    if (k === 'title' && !String(value || '').trim()) { setF(s => ({ ...s, title: task.title || '' })); setBad({ k, text: 'A task needs a title, so the old one is back.' }); return }
    if (k === 'effortHours' && value !== '' && !(Number(value) >= 0)) { setF(s => ({ ...s, effortHours: task.effortHours ?? '' })); setBad({ k, text: 'Effort is in hours, zero or more.' }); return }
    onPatch(task.id, { [k]: k === 'tags' ? value : (value === '' ? null : value) })
  }
  const date = (k) => (v) => { set(k, v); if (String(v || '') !== String((task[k] || '').slice(0, 10))) onPatch(task.id, { [k]: v || null }) }
  // Enter leaves the field and the blur saves it, once. Escape is on the whole editor, below.
  const onKey = () => (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); e.target.blur() } }
  const msg = (k) => bad?.k === k ? <span id={`task-${task.id}-${k}-msg`} role="alert" className="mt-1 block text-[12.5px] leading-snug" style={{ color: 'var(--caution)' }}>{bad.text}</span> : null
  const described = (k) => bad?.k === k ? { 'aria-invalid': true, 'aria-describedby': `task-${task.id}-${k}-msg` } : {}
  const external = task.source && task.source !== 'local'
  const inp = INP
  const sourceName = SOURCE[task.source] || task.planTitle || task.source
  // The ordering fields only matter for a part: folded away until the task has a supplier or an order date, or you open them.
  const hasOrder = Boolean(task.supplier || task.poNumber || task.orderBy || task.orderedOn || task.deliveredOn)
  const [orderOpen, setOrderOpen] = useState(hasOrder)
  const showOrder = orderOpen || hasOrder

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
      onKeyDown={e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.stopPropagation(); onClose() } }}
      transition={{ duration: .22, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
      <div className="@container mt-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
        {(toolbar || (external && task.url)) && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">{toolbar}</div>
            {external && task.url && (
              <button type="button" onClick={() => openExternal(task.url)} className="-my-1 inline-flex items-center gap-1.5 py-1 text-[13px] font-medium underline-offset-2 hover:underline" style={{ color: 'var(--accent)' }}>
                Open in {sourceName.replace(/^the /, '')}<ArrowSquareOut size={12} weight="bold" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        <Group title="The task">
          <L label="Title" span>
            <input value={f.title} disabled={external} title={external ? `${sourceName} owns the title` : ''} onChange={e => set('title', e.target.value)} onBlur={() => commit('title')} onKeyDown={onKey('title')} {...described('title')} className={inp + (external ? ' opacity-60' : '')} />
            {msg('title')}
          </L>
          <div className="min-w-0 @xs:col-span-2">
            <L label="Project">
              <input list={`machines-${task.id}`} autoComplete="off" value={f.project} placeholder={task.meta?.machine || 'I-1050, a machine, a build'}
                onChange={e => { const v = e.target.value; set('project', v); if (machines.includes(v) && v !== (task.project || '')) onPatch(task.id, { project: v }) }}
                onBlur={() => commit('project')} onKeyDown={onKey('project')} className={inp} />
              <datalist id={`machines-${task.id}`}>{machines.map(m => <option key={m} value={m} />)}</datalist>
            </L>
            {planned && (
              <select value={task.phase || ''} aria-label="Phase" onChange={e => onPatch(task.id, { phase: e.target.value || null })} className={inp + ' mt-1.5 cursor-pointer'}>
                <option value="">no phase</option>
                {planned.phases.map(ph => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
              </select>
            )}
            {useMachine && (
              <button type="button" onClick={() => { onPatch(task.id, { project: useMachine }); setMachineOffered(false) }} aria-label={`Use ${useMachine} as the project`}
                className="pill btn-quiet mt-1.5 inline-flex h-6 items-center px-2.5 text-[12.5px] font-medium">Use {useMachine}</button>
            )}
          </div>
          <L label="Due">
            {external && task.dueDate ? <input value={fmtDate(task.dueDate)} disabled title={`${sourceName} owns the due date`} className={inp + ' opacity-60 tnum'} /> : <DateField className="mt-1" value={f.dueDate} onChange={date('dueDate')} />}
          </L>
          <L label="Priority">
            <select value={f.priority ?? ''} onChange={e => { const v = e.target.value === '' ? null : Number(e.target.value); set('priority', v); onPatch(task.id, { priority: v }) }} className={inp + ' cursor-pointer'}>
              {PRIO.map(([v, l]) => <option key={String(v)} value={v ?? ''}>{l}</option>)}
            </select>
          </L>
          <L label="Hours">
            <input type="number" min="0" step="0.5" value={f.effortHours} placeholder="how long" onChange={e => set('effortHours', e.target.value)} onBlur={() => commit('effortHours')} onKeyDown={onKey('effortHours')} {...described('effortHours')} className={inp + ' tnum'} />
            {msg('effortHours')}
          </L>
          <L label="Repeats">
            <select value={f.repeat ?? ''} onChange={e => { const v = e.target.value || null; set('repeat', v); onPatch(task.id, { repeat: v }) }} className={inp + ' cursor-pointer'}>
              {REPEAT.map(([v, l]) => <option key={String(v)} value={v ?? ''}>{l}</option>)}
            </select>
          </L>
          <L label="From">
            <input value={f.assignedBy} placeholder={task.meta?.from || 'who handed it over'} onChange={e => set('assignedBy', e.target.value)} onBlur={() => commit('assignedBy')} onKeyDown={onKey('assignedBy')} className={inp} />
          </L>
          <L label="Lead">
            <input value={f.lead} placeholder="you, unless someone else" onChange={e => set('lead', e.target.value)} onBlur={() => commit('lead')} onKeyDown={onKey('lead')} className={inp} />
          </L>
        </Group>

        <Group title="Waiting and reminders">
          <L label="Waiting on">
            <input value={f.waitingOn} placeholder="who has it now" onChange={e => set('waitingOn', e.target.value)} onBlur={() => commit('waitingOn')} onKeyDown={onKey('waitingOn')} className={inp} />
          </L>
          {!task.done && <RemindMe task={task} onPatch={onPatch} />}
        </Group>

        {showOrder ? (
          <Group title="Parts and ordering">
            <L label="Supplier">
              <input value={f.supplier} placeholder="who delivers it" onChange={e => set('supplier', e.target.value)} onBlur={() => commit('supplier')} onKeyDown={onKey('supplier')} className={inp} />
            </L>
            <L label="PO number">
              <input value={f.poNumber} placeholder="from the order" onChange={e => set('poNumber', e.target.value)} onBlur={() => commit('poNumber')} onKeyDown={onKey('poNumber')} className={inp + ' tnum'} />
            </L>
            <L label="Order by">
              <DateField className="mt-1" value={f.orderBy} onChange={date('orderBy')} placeholder="last day" />
            </L>
            <L label="Ordered">
              <DateField className="mt-1" value={f.orderedOn} onChange={date('orderedOn')} placeholder="not yet" />
            </L>
            <L label="Delivered">
              <DateField className="mt-1" value={f.deliveredOn} onChange={date('deliveredOn')} placeholder="not yet" />
            </L>
            <LeadTimeHint task={task} onPatch={onPatch} />
          </Group>
        ) : (
          <button type="button" onClick={() => setOrderOpen(true)} className="pill btn-ghost mt-4 inline-flex h-7 items-center gap-1.5 px-2.5 text-[13px]">
            <Plus size={12} weight="bold" aria-hidden="true" /> Parts and ordering
          </button>
        )}

        <Group title="Notes and steps">
          <L label="Notes" span>
            <textarea rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} onBlur={() => commit('notes')} onKeyDown={onKey('notes')} className={inp + ' resize-y'} />
          </L>
          <ChecklistEditor task={task} onPatch={onPatch} />
          <L label="Tags" span>
            <input value={f.tags} placeholder="comma separated: electrical, test protocol" onChange={e => set('tags', e.target.value)} onBlur={() => commit('tags')} onKeyDown={onKey('tags')} className={inp} />
          </L>
        </Group>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[13px]" style={{ color: 'var(--ink-3)' }}>
        <span>{external ? `Title, due date and status come from ${sourceName}. Everything else is yours.` : 'Saves as you go.'}</span>
        <button onClick={onClose} className="-my-1 inline-block shrink-0 py-1 underline underline-offset-2">Close</button>
      </div>
    </motion.div>
  )
}

const draft = t => ({
  title: t.title || '', assignedBy: t.assignedBy || '', lead: t.lead || '', project: t.project || '',
  priority: t.priority ?? null, effortHours: t.effortHours ?? '', dueDate: t.dueDate ? t.dueDate.slice(0, 10) : '',
  orderBy: t.orderBy ? t.orderBy.slice(0, 10) : '', orderedOn: t.orderedOn ? t.orderedOn.slice(0, 10) : '', deliveredOn: t.deliveredOn ? t.deliveredOn.slice(0, 10) : '',
  supplier: t.supplier || '', poNumber: t.poNumber || '',
  repeat: t.repeat ?? null, waitingOn: t.waitingOn || '', tags: (t.tags || []).join(', '), notes: t.notes || ''
})
