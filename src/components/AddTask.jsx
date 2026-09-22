import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Plus } from '@phosphor-icons/react'

const INP = 'field mt-1 w-full px-2 py-1.5 text-[12px]'
const L = ({ label, children }) => <label className="text-[10.5px]" style={{ color: 'var(--ink-3)' }}>{label}{children}</label>

export default function AddTask({ lane, onCreate }) {
  const [open, setOpen] = useState(false)
  const BLANK = { title: '', dueDate: '', orderBy: '', waitingOn: '', assignedBy: '', lead: '', project: '', priority: '', effortHours: '', tags: '' }
  const [f, setF] = useState(BLANK)
  const [more, setMore] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const reset = () => { setF(BLANK); setMore(false); setOpen(false) }
  const submit = e => {
    e.preventDefault(); if (!f.title.trim()) return
    onCreate({ title: f.title, lane, dueDate: f.dueDate || null, orderBy: f.orderBy || null, waitingOn: f.waitingOn || null,
      assignedBy: f.assignedBy || null, lead: f.lead || null, project: f.project || null,
      priority: f.priority === '' ? null : Number(f.priority), effortHours: f.effortHours === '' ? null : Number(f.effortHours), tags: f.tags })
    reset()
  }
  const inp = INP
  return (
    <AnimatePresence mode="wait" initial={false}>
      {!open ? (
        <motion.button key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-[12.5px] transition-colors"
          style={{ border: '1px dashed var(--line-2)', borderRadius: 12, color: 'var(--ink-3)' }}>
          <Plus size={12} weight="bold" /> Add
        </motion.button>
      ) : (
        <motion.form key="f" onSubmit={submit}
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
          transition={{ duration: .25, ease: [0.16, 1, 0.3, 1] }}
          className="row overflow-hidden p-3">
          <input autoFocus value={f.title} onChange={e => set('title', e.target.value)}
            onKeyDown={e => e.key === 'Escape' && reset()} placeholder="What needs doing?"
            className="field w-full px-2.5 py-2 text-[13px] outline-none" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[10.5px]" style={{ color: 'var(--ink-3)' }}>Due
              <input type="date" value={f.dueDate} onChange={e => set('dueDate', e.target.value)}
                className="field mt-1 w-full px-2 py-1.5 text-[12px]" /></label>
            <label className="text-[10.5px]" style={{ color: 'var(--ink-3)' }}>Order by
              <input type="date" value={f.orderBy} onChange={e => set('orderBy', e.target.value)}
                title="Last day an order still lands before the build needs it"
                className="field mt-1 w-full px-2 py-1.5 text-[12px]" /></label>
          </div>
          {lane === 'waiting' && (
            <input value={f.waitingOn} onChange={e => set('waitingOn', e.target.value)} placeholder="Who has it?"
              className="field mt-2 w-full px-2.5 py-1.5 text-[12.5px]" />
          )}
          {more && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <L label="Assigned by"><input value={f.assignedBy} onChange={e => set('assignedBy', e.target.value)} className={inp} /></L>
              <L label="Lead"><input value={f.lead} onChange={e => set('lead', e.target.value)} placeholder="you, unless" className={inp} /></L>
              <L label="Project"><input value={f.project} onChange={e => set('project', e.target.value)} className={inp} /></L>
              <L label="Priority">
                <select value={f.priority} onChange={e => set('priority', e.target.value)} className={inp + ' cursor-pointer'}>
                  <option value="">None</option><option value="1">P1 now</option><option value="2">P2 this week</option><option value="3">P3 when there is room</option>
                </select>
              </L>
              <L label="Effort, hours"><input type="number" min="0" step="0.5" value={f.effortHours} onChange={e => set('effortHours', e.target.value)} className={inp} /></L>
              <L label="Tags"><input value={f.tags} onChange={e => set('tags', e.target.value)} placeholder="comma separated" className={inp} /></L>
            </div>
          )}
          <div className="mt-2.5 flex items-center gap-3">
            <button type="submit" className="pill px-4 py-1.5 text-[12px] font-medium"
              style={{ background: 'var(--ink)', color: 'var(--bg)' }}>Add</button>
            <button type="button" onClick={() => setMore(v => !v)} className="text-[12px]" style={{ color: 'var(--ink-3)' }}>{more ? 'Fewer fields' : 'More fields'}</button>
            <button type="button" onClick={reset} className="ml-auto text-[12px]" style={{ color: 'var(--ink-3)' }}>Cancel</button>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  )
}
