import { motion } from 'motion/react'
import { Check, X } from '@phosphor-icons/react'
import { LANES, LANE_ORDER, daysSince, daysUntil, fmtDate } from '../lanes.js'

const ANNO = {
  rev:  'var(--rev)', caut: 'var(--caut)', cons: 'var(--cons)', faint: 'var(--ink-faint)'
}

/** A line on the sheet. Ruled, not floated: no card, no shadow, no radius. */
export default function TaskRow({ task, onPatch, onDelete, n }) {
  const overdueBy   = task.dueDate ? -daysUntil(task.dueDate) : null
  const waitingDays = task.waitingSince ? daysSince(task.waitingSince) : null
  const coldDays    = task.lane === 'innovation' ? daysSince(task.lastTouched) : null
  const orderIn     = task.orderBy ? daysUntil(task.orderBy) : null

  const notes = []
  if (task.planTitle) notes.push([task.planTitle, ANNO.faint])
  if (overdueBy > 0) notes.push([`${overdueBy}d overdue`, ANNO.rev])
  else if (task.dueDate) notes.push([fmtDate(task.dueDate), ANNO.faint])
  if (orderIn !== null) notes.push([orderIn <= 0 ? 'order past' : `order ${orderIn}d`, orderIn <= 7 ? ANNO.caut : ANNO.faint])
  if (task.waitingOn) notes.push([task.waitingOn, ANNO.cons])
  if (waitingDays !== null) notes.push([`held ${waitingDays}d`, waitingDays >= 7 ? ANNO.rev : ANNO.cons])
  if (coldDays !== null && coldDays >= 14) notes.push([`cold ${coldDays}d`, ANNO.caut])

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: task.done ? .38 : 1 }}
      exit={{ opacity: 0, transition: { duration: .12 } }}
      transition={{ duration: .25 }}
      className="rule-t group flex items-start gap-3 py-2.5"
      style={{ borderColor: 'var(--rule)' }}>

      {n != null && <span className="num mt-[3px] w-4 shrink-0 text-[10.5px]"
                          style={{ color: 'var(--ink-faint)' }}>{n}</span>}

      <button
        role="checkbox" aria-checked={task.done}
        aria-label={`${task.done ? 'Reopen' : 'Complete'} ${task.title}`}
        onClick={() => onPatch(task.id, { done: !task.done })}
        className="mt-[2px] grid h-[15px] w-[15px] shrink-0 place-items-center transition-colors"
        style={{
          border: `1px solid ${task.done ? 'var(--ver)' : 'var(--rule-strong)'}`,
          background: task.done ? 'var(--ver)' : 'transparent'
        }}>
        {task.done && <Check size={10} weight="bold" color="var(--sheet)" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug"
           style={{ textDecoration: task.done ? 'line-through' : 'none' }}>
          {task.title}
        </p>
        {notes.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {notes.map(([text, color], i) => (
              <span key={i} className="anno" style={{ color }}>{text}</span>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <select
          aria-label={`Move "${task.title}"`}
          value={task.lane}
          onChange={e => onPatch(task.id, { lane: e.target.value })}
          className="anno cursor-pointer bg-transparent px-1 py-0.5"
          style={{ border: '1px solid var(--rule)' }}>
          {LANE_ORDER.map(k => <option key={k} value={k}>{LANES[k].label}</option>)}
        </select>
        <button onClick={() => onDelete(task.id)} aria-label={`Delete "${task.title}"`}
                className="grid h-5 w-5 place-items-center" style={{ color: 'var(--ink-faint)' }}>
          <X size={11} weight="bold" />
        </button>
      </div>
    </motion.li>
  )
}
