import { useEffect, useState } from 'react'
import { motion } from 'motion/react'

const L = ({ label, children, span }) => (
  <label className={`text-[10.5px] ${span ? 'col-span-2' : ''}`} style={{ color: 'var(--ink-3)' }}>{label}{children}</label>
)
const INP = 'field mt-1 w-full px-2 py-1.5 text-[12px]'
const PRIO = [[null, 'None'], [1, 'P1 now'], [2, 'P2 this week'], [3, 'P3 when there is room']]

/**
 * The full set of fields for one task, opened from the card. Saves on blur and on Enter,
 * so there is no Save button to forget. Escape closes.
 */
export default function TaskEditor({ task, onPatch, onClose }) {
  const [f, setF] = useState(() => draft(task))
  useEffect(() => { setF(draft(task)) }, [task.id, task.updatedAt])
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const commit = (k) => {
    const value = f[k]
    const current = k === 'tags' ? (task.tags || []).join(', ') : (task[k] ?? '')
    if (String(value ?? '') === String(current ?? '')) return
    onPatch(task.id, { [k]: k === 'tags' ? value : (value === '' ? null : value) })
  }
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
        <L label="Due">
          <input type="date" value={f.dueDate} disabled={external && task.dueDate} onChange={e => set('dueDate', e.target.value)} onBlur={() => commit('dueDate')} className={inp} />
        </L>
        <L label="Order by">
          <input type="date" value={f.orderBy} title="Last day an order still lands before the build needs it" onChange={e => set('orderBy', e.target.value)} onBlur={() => commit('orderBy')} className={inp} />
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
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: 'var(--ink-3)' }}>
        <span>{external ? `Title, due date and status come from ${task.planTitle || task.source}. Everything else is yours.` : 'Saves as you go.'}</span>
        <button onClick={onClose} className="underline underline-offset-2">Close</button>
      </div>
    </motion.div>
  )
}

const draft = t => ({
  title: t.title || '', assignedBy: t.assignedBy || '', lead: t.lead || '', project: t.project || '',
  priority: t.priority ?? null, effortHours: t.effortHours ?? '', dueDate: t.dueDate ? t.dueDate.slice(0, 10) : '',
  orderBy: t.orderBy ? t.orderBy.slice(0, 10) : '', waitingOn: t.waitingOn || '', tags: (t.tags || []).join(', '), notes: t.notes || ''
})
