import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Check, X, ArrowSquareOut, SlidersHorizontal } from '@phosphor-icons/react'
import TaskEditor from './TaskEditor.jsx'
import { openExternal } from '../api.js'
import { LANES } from '../copy.js'
import { STATUS } from '../scenes.js'
import { daysSince, daysUntil, fmtDate } from '../lanes.js'

const LANE_ORDER = ['today', 'innovation', 'waiting', 'active', 'parked']
const ORIGIN = { issues: 'Issues', qms: 'QMS', bom: 'BOM', planner: 'Planner' }

function Tag({ children, color }) {
  return (
    <span className="rounded-md px-1.5 py-[2px] text-[10.5px] font-medium tracking-wide"
          style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      {children}
    </span>
  )
}

const PRIO_COLOR = { 1: STATUS.overdue, 2: STATUS.caution, 3: STATUS.muted }

export default function TaskCard({ task, onPatch, onDelete }) {
  const [editing, setEditing] = useState(false)
  const from = task.assignedBy || task.meta?.from
  const over = task.dueDate ? -daysUntil(task.dueDate) : null
  const held = task.waitingSince ? daysSince(task.waitingSince) : null
  const cold = task.lane === 'innovation' ? daysSince(task.lastTouched) : null
  const orderIn = task.orderBy ? daysUntil(task.orderBy) : null

  return (
    <motion.li layout
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: task.done ? .4 : 1, y: 0 }}
      exit={{ opacity: 0, scale: .97, transition: { duration: .15 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      id={`task-${task.id}`} className="group row px-4 py-3">
      <div className="flex items-start gap-3">

      <motion.button role="checkbox" aria-checked={task.done} whileTap={{ scale: .85 }}
        aria-label={`${task.done ? 'Reopen' : 'Complete'} ${task.title}`}
        onClick={() => onPatch(task.id, { done: !task.done })}
        className="mt-[2px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-colors"
        style={{ borderColor: task.done ? STATUS.done : 'var(--line-2)',
                 background: task.done ? STATUS.done : 'transparent' }}>
        {task.done && <Check size={11} weight="bold" color="var(--bg)" />}
      </motion.button>

      <div className="min-w-0 flex-1">
        <p className="cursor-text text-[13.5px] leading-snug" onClick={() => setEditing(v => !v)}
           style={{ textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5 empty:hidden">
          {task.priority && <Tag color={PRIO_COLOR[task.priority]}>P{task.priority}</Tag>}
          {ORIGIN[task.source] && <Tag color="var(--accent)">{ORIGIN[task.source]}</Tag>}
          {task.project && <Tag color="rgba(var(--ink-rgb),.6)">{task.project}</Tag>}
          {from && <Tag color="rgba(var(--ink-rgb),.5)">from {from}</Tag>}
          {task.lead && <Tag color="rgba(var(--ink-rgb),.5)">lead {task.lead}</Tag>}
          {task.effortHours ? <Tag color={STATUS.muted}>{task.effortHours}h</Tag> : null}
          {(task.tags || []).map(t => <Tag key={t} color="rgba(var(--ink-rgb),.4)">{t}</Tag>)}
          {task.planTitle && task.source !== 'qms' && task.source !== 'issues' && <Tag color="rgba(var(--ink-rgb),.6)">{task.planTitle}</Tag>}
          {task.bucketName && <Tag color="rgba(var(--ink-rgb),.5)">{task.bucketName}</Tag>}
          {task.sourceStatus && !task.done && <Tag color={STATUS.muted}>{task.sourceStatus}</Tag>}
          {task.meta?.prio && <Tag color={STATUS.caution}>P{task.meta.prio}</Tag>}
          {task.meta?.priority && /high/i.test(task.meta.priority) && <Tag color={STATUS.overdue}>high</Tag>}
          {over > 0 ? <Tag color={STATUS.overdue}>{over}d overdue</Tag>
                    : task.dueDate && <Tag color={STATUS.muted}>{fmtDate(task.dueDate)}</Tag>}
          {orderIn !== null && <Tag color={orderIn < 0 ? STATUS.overdue : orderIn <= 7 ? STATUS.caution : STATUS.muted}>
            {orderIn < 0 ? 'order date passed' : orderIn === 0 ? 'order today' : `order in ${orderIn}d`}</Tag>}
          {task.waitingOn && <Tag color={STATUS.held}>{task.waitingOn}</Tag>}
          {held !== null && <Tag color={held >= 7 ? STATUS.overdue : STATUS.held}>with them {held}d</Tag>}
          {cold !== null && cold >= 14 && <Tag color={STATUS.caution}>untouched {cold}d</Tag>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100" style={editing ? { opacity: 1 } : undefined}>
        {!task.done && task.lane !== 'today' && (
          <button onClick={() => onPatch(task.id, { lane: 'today' })} aria-label="Pull to Today" title="Pull to Today"
                  className="pill mr-1 px-2 py-0.5 text-[10.5px] font-medium" style={{ border: '1px solid var(--line-2)', color: 'var(--ink-2)' }}>Today</button>
        )}
        <button onClick={() => setEditing(v => !v)} aria-label="Edit details" title="Details"
                className="grid h-6 w-6 place-items-center rounded-md" style={{ color: editing ? 'var(--ink)' : 'var(--ink-3)' }}><SlidersHorizontal size={12} weight="bold" /></button>
        {task.url && <button onClick={() => openExternal(task.url)} aria-label="Open in the tool" title="Open in the tool"
                className="grid h-6 w-6 place-items-center rounded-md" style={{ color: 'var(--ink-3)' }}><ArrowSquareOut size={12} weight="bold" /></button>}
        <select aria-label="Move to lane" value={task.lane}
          onChange={e => onPatch(task.id, { lane: e.target.value })}
          className="field cursor-pointer px-1.5 py-1 text-[11px]">
          {LANE_ORDER.map(k => <option key={k} value={k}>{LANES[k].label}</option>)}
        </select>
        <button onClick={() => onDelete(task.id)} aria-label="Delete"
                className="grid h-6 w-6 place-items-center rounded-md" style={{ color: 'var(--ink-3)' }}>
          <X size={12} weight="bold" />
        </button>
      </div>
      </div>
      <AnimatePresence initial={false}>
        {editing && <TaskEditor key="ed" task={task} onPatch={onPatch} onClose={() => setEditing(false)} />}
      </AnimatePresence>
    </motion.li>
  )
}
