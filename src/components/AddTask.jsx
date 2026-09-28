import { useId, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Plus } from '@phosphor-icons/react'
import DateField from './DateField.jsx'

const INP = 'field mt-1 w-full px-2 py-1.5 text-[13px]'
const L = ({ label, children }) => <label className="block text-[13px]" style={{ color: 'var(--ink-3)' }}>{label}{children}</label>

/**
 * The Add row under a lane. An empty title or a negative effort says so under the field instead of doing
 * nothing; Enter twice adds once; Escape anywhere in the form cancels; after Add or Cancel, focus goes back
 * to the Add button so the keyboard does not fall to the top of the page.
 */
export default function AddTask({ lane, onCreate }) {
  const [open, setOpen] = useState(false)
  const BLANK = { title: '', dueDate: '', orderBy: '', waitingOn: '', assignedBy: '', lead: '', project: '', priority: '', effortHours: '', tags: '' }
  const [f, setF] = useState(BLANK)
  const [more, setMore] = useState(false)
  const [err, setErr] = useState(null)
  const [invalid, setInvalid] = useState(null)   // 'title' or 'effort', with its line under the form
  const busy = useRef(false)
  const back = useRef(false)   // the Add button takes focus when it comes back
  const titleRef = useRef(null)
  const msgId = useId()
  const set = (k, v) => { setF(s => ({ ...s, [k]: v })); if (invalid) setInvalid(null) }
  const reset = () => { setF(BLANK); setMore(false); setOpen(false); setErr(null); setInvalid(null); back.current = true }
  const submit = async e => {
    e.preventDefault()
    if (busy.current) return
    if (!f.title.trim()) { setInvalid('title'); titleRef.current?.focus(); return }
    if (f.effortHours !== '' && !(Number(f.effortHours) >= 0)) { setInvalid('effort'); return }
    busy.current = true
    try {
      await onCreate({ title: f.title, lane, dueDate: f.dueDate || null, orderBy: f.orderBy || null, waitingOn: f.waitingOn || null,
        assignedBy: f.assignedBy || null, lead: f.lead || null, project: f.project || null,
        priority: f.priority === '' ? null : Number(f.priority), effortHours: f.effortHours === '' ? null : Number(f.effortHours), tags: f.tags })
      reset()
    } catch (x) { setErr(x.message) } finally { busy.current = false }
  }
  const inp = INP
  return (
    <AnimatePresence mode="wait" initial={false}>
      {!open ? (
        <motion.button key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          ref={el => { if (el && back.current) { back.current = false; el.focus({ preventScroll: true }) } }}
          onClick={() => setOpen(true)}
          className="btn-ghost flex w-full items-center gap-2 rounded-[12px] px-4 py-2.5 text-[13px]"
          style={{ color: 'var(--ink-3)' }}>
          <Plus size={12} weight="bold" /> Add
        </motion.button>
      ) : (
        <motion.form key="f" onSubmit={submit} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); reset() } }}
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
          transition={{ duration: .25, ease: [0.16, 1, 0.3, 1] }}
          className="row overflow-hidden p-3">
          <input ref={titleRef} autoFocus value={f.title} onChange={e => set('title', e.target.value)} placeholder="What needs doing?"
            aria-label="Task title" aria-invalid={invalid === 'title' || undefined} aria-describedby={invalid || err ? msgId : undefined}
            className="field w-full px-2.5 py-2 text-[13.5px] outline-none" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <L label="Due"><DateField className="mt-1" value={f.dueDate} onChange={v => set('dueDate', v)} placeholder="no date" /></L>
            <L label="Order by"><DateField className="mt-1" value={f.orderBy} onChange={v => set('orderBy', v)} placeholder="last day to order" /></L>
          </div>
          {lane === 'waiting' && (
            <input value={f.waitingOn} onChange={e => set('waitingOn', e.target.value)} placeholder="Who has it?" aria-label="Waiting on"
              className="field mt-2 w-full px-2.5 py-1.5 text-[13px]" />
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
              <L label="Effort, hours"><input type="number" min="0" step="0.5" value={f.effortHours} onChange={e => set('effortHours', e.target.value)} aria-invalid={invalid === 'effort' || undefined} aria-describedby={invalid === 'effort' ? msgId : undefined} className={inp} /></L>
              <L label="Tags"><input value={f.tags} onChange={e => set('tags', e.target.value)} placeholder="comma separated" className={inp} /></L>
            </div>
          )}
          {(err || invalid) && <p id={msgId} role="alert" className="mt-2 text-[13px]" style={{ color: 'var(--caution)' }}>{invalid === 'title' ? 'Type what needs doing first.' : invalid === 'effort' ? 'Effort is in hours, zero or more.' : err}</p>}
          <div className="mt-2.5 flex items-center gap-3">
            <button type="submit" className="pill btn-primary px-4 py-1.5 text-[13px] font-medium">Add</button>
            <button type="button" onClick={() => setMore(v => !v)} aria-expanded={more} className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{more ? 'Fewer fields' : 'More fields'}</button>
            <button type="button" onClick={reset} className="ml-auto text-[13px]" style={{ color: 'var(--ink-3)' }}>Cancel</button>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  )
}
