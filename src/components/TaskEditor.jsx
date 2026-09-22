import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Check, X } from '@phosphor-icons/react'
import DateField from './DateField.jsx'
import { STATUS } from '../scenes.js'

const L = ({ label, children, span }) => (
  <label className={`block text-[13px] ${span ? 'col-span-2' : ''}`} style={{ color: 'var(--ink-3)' }}>{label}{children}</label>
)
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
    <div className="col-span-2 sm:col-span-4">
      <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Checklist{list.length ? <span className="tnum"> · {list.filter(c => c.done).length} of {list.length}</span> : null}</span>
      <ul className="mt-1 flex flex-col gap-1">
        {list.map(c => (
          <li key={c.id} className="flex items-center gap-2">
            <button role="checkbox" aria-checked={c.done} aria-label={`${c.done ? 'Untick' : 'Tick'} ${c.text}`} onClick={() => set(list.map(x => x.id === c.id ? { ...x, done: !x.done } : x))}
              className="grid h-[14px] w-[14px] shrink-0 place-items-center rounded-[4px] border" style={{ borderColor: c.done ? STATUS.done : 'var(--line-2)', background: c.done ? STATUS.done : 'transparent' }}>
              {c.done && <Check size={9} weight="bold" color="var(--bg)" />}
            </button>
            <span className="flex-1 text-[13px]" style={{ color: c.done ? 'var(--ink-3)' : 'var(--ink)', textDecoration: c.done ? 'line-through' : 'none' }}>{c.text}</span>
            <button onClick={() => set(list.filter(x => x.id !== c.id))} aria-label={`Remove ${c.text}`} className="grid h-5 w-5 place-items-center rounded" style={{ color: 'var(--ink-3)' }}><X size={11} /></button>
          </li>
        ))}
      </ul>
      <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} onBlur={add}
        placeholder={list.length ? 'Another step' : 'First step, then Enter'} className={INP} />
    </div>
  )
}

/**
 * The full set of fields for one task, opened from the card. Saves on blur and on Enter,
 * so there is no Save button to forget. Escape closes.
 */
export default function TaskEditor({ task, onPatch, onClose }) {
  const [f, setF] = useState(() => draft(task))
  useEffect(() => { setF(draft(task)) }, [task.id, task.updatedAt])   // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const commit = (k) => {
    const value = f[k]
    const current = k === 'tags' ? (task.tags || []).join(', ') : (task[k] ?? '')
    if (String(value ?? '') === String(current ?? '')) return
    onPatch(task.id, { [k]: k === 'tags' ? value : (value === '' ? null : value) })
  }
  const date = (k) => (v) => { set(k, v); if (String(v || '') !== String((task[k] || '').slice(0, 10))) onPatch(task.id, { [k]: v || null }) }
  const onKey = (k) => (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); commit(k); e.target.blur() } if (e.key === 'Escape') onClose() }
  const external = task.source && task.source !== 'local'
  const inp = INP

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
      transition={{ duration: .22, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
      <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-4" style={{ borderColor: 'var(--line)' }}>
        <L label="Title" span>
          <input value={f.title} disabled={external} title={external ? 'The tool owns the title' : ''} onChange={e => set('title', e.target.value)} onBlur={() => commit('title')} onKeyDown={onKey('title')} className={inp + (external ? ' opacity-60' : '')} />
        </L>
        <L label="Assigned by">
          <input value={f.assignedBy} placeholder={task.meta?.from || 'who handed it over'} onChange={e => set('assignedBy', e.target.value)} onBlur={() => commit('assignedBy')} onKeyDown={onKey('assignedBy')} className={inp} />
        </L>
        <L label="Lead">
          <input value={f.lead} placeholder="you, unless someone else carries it" onChange={e => set('lead', e.target.value)} onBlur={() => commit('lead')} onKeyDown={onKey('lead')} className={inp} />
        </L>
        <L label="Project">
          <input value={f.project} placeholder={task.meta?.machine || task.planTitle || 'machine, build, programme'} onChange={e => set('project', e.target.value)} onBlur={() => commit('project')} onKeyDown={onKey('project')} className={inp} />
        </L>
        <L label="Priority">
          <select value={f.priority ?? ''} onChange={e => { const v = e.target.value === '' ? null : Number(e.target.value); set('priority', v); onPatch(task.id, { priority: v }) }} className={inp + ' cursor-pointer'}>
            {PRIO.map(([v, l]) => <option key={String(v)} value={v ?? ''}>{l}</option>)}
          </select>
        </L>
        <L label="Effort, hours">
          <input type="number" min="0" step="0.5" value={f.effortHours} onChange={e => set('effortHours', e.target.value)} onBlur={() => commit('effortHours')} onKeyDown={onKey('effortHours')} className={inp} />
        </L>
        <L label="Repeats">
          <select value={f.repeat ?? ''} onChange={e => { const v = e.target.value || null; set('repeat', v); onPatch(task.id, { repeat: v }) }} className={inp + ' cursor-pointer'}>
            {REPEAT.map(([v, l]) => <option key={String(v)} value={v ?? ''}>{l}</option>)}
          </select>
        </L>
        <L label="Due">
          {external && task.dueDate ? <input value={f.dueDate} disabled className={inp + ' opacity-60'} /> : <DateField className="mt-1" value={f.dueDate} onChange={date('dueDate')} />}
        </L>
        <L label="Order by">
          <DateField className="mt-1" value={f.orderBy} onChange={date('orderBy')} placeholder="last day to order" />
        </L>
        <L label="Ordered on">
          <DateField className="mt-1" value={f.orderedOn} onChange={date('orderedOn')} placeholder="not yet" />
        </L>
        <L label="Supplier">
          <input value={f.supplier} placeholder="who delivers it" onChange={e => set('supplier', e.target.value)} onBlur={() => commit('supplier')} onKeyDown={onKey('supplier')} className={inp} />
        </L>
        <L label="PO number">
          <input value={f.poNumber} placeholder="from the order" onChange={e => set('poNumber', e.target.value)} onBlur={() => commit('poNumber')} onKeyDown={onKey('poNumber')} className={inp + ' tnum'} />
        </L>
        <L label="Waiting on">
          <input value={f.waitingOn} placeholder="who has it" onChange={e => set('waitingOn', e.target.value)} onBlur={() => commit('waitingOn')} onKeyDown={onKey('waitingOn')} className={inp} />
        </L>
        <L label="Tags, comma separated" span>
          <input value={f.tags} placeholder="electrical, supplier, test protocol" onChange={e => set('tags', e.target.value)} onBlur={() => commit('tags')} onKeyDown={onKey('tags')} className={inp} />
        </L>
        <L label="Notes" span>
          <textarea rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} onBlur={() => commit('notes')} onKeyDown={onKey('notes')} className={inp + ' resize-y'} />
        </L>
        <ChecklistEditor task={task} onPatch={onPatch} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[13px]" style={{ color: 'var(--ink-3)' }}>
        <span>{external ? `Title, due date and status come from ${task.planTitle || task.source}. Everything else is yours.` : 'Saves as you go.'}</span>
        <button onClick={onClose} className="underline underline-offset-2">Close</button>
      </div>
    </motion.div>
  )
}

const draft = t => ({
  title: t.title || '', assignedBy: t.assignedBy || '', lead: t.lead || '', project: t.project || '',
  priority: t.priority ?? null, effortHours: t.effortHours ?? '', dueDate: t.dueDate ? t.dueDate.slice(0, 10) : '',
  orderBy: t.orderBy ? t.orderBy.slice(0, 10) : '', orderedOn: t.orderedOn ? t.orderedOn.slice(0, 10) : '', supplier: t.supplier || '', poNumber: t.poNumber || '',
  repeat: t.repeat ?? null, waitingOn: t.waitingOn || '', tags: (t.tags || []).join(', '), notes: t.notes || ''
})
