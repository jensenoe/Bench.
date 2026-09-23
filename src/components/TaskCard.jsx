import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Check, X, ArrowSquareOut, SlidersHorizontal, DotsSixVertical, ArrowsClockwise, Timer, LinkSimple } from '@phosphor-icons/react'
import TaskEditor from './TaskEditor.jsx'
import { openExternal, openLink } from '../api.js'
import { LANES } from '../copy.js'
import { STATUS } from '../scenes.js'
import { daysSince, daysUntil, fmtDate } from '../lanes.js'
import * as focus from '../focus.js'

const LANE_ORDER = ['today', 'innovation', 'waiting', 'active', 'parked']
const ORIGIN = { issues: 'Issues', qms: 'QMS', bom: 'BOM', planner: 'Planner' }
export const DRAG_TYPE = 'text/bench-task'

function Tag({ children, color, title }) {
  return (
    <span title={title || (typeof children === 'string' ? children : undefined)} className="tag rounded-md px-1.5 py-[2px] text-[12px] font-medium tracking-wide"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      {children}
    </span>
  )
}

const PRIO_COLOR = { 1: STATUS.overdue, 2: STATUS.caution, 3: STATUS.muted }

/**
 * Card ageing (roadmap 90): the hairline follows how long since the task was touched. Two days is the
 * plain line; by day 14 it carries 45 percent caution; from day 30 it is 45 percent late. Tokens only.
 */
export function ageBorder(days) {
  if (days === null || days === undefined || days <= 2) return null
  if (days >= 30) return 'color-mix(in srgb, var(--late) 45%, var(--line))'
  const pct = Math.round(45 * Math.min(1, (days - 2) / 12))
  return `color-mix(in srgb, var(--caution) ${pct}%, var(--line))`
}
/** The focus timer's default length: App writes it on <html data-focus-minutes>; 25 when it has not. */
const focusMinutes = (prop) => Number(prop) || Number(document.documentElement.dataset.focusMinutes) || 25

/** A step inside the task, ticked from the card. */
function Checklist({ task, onPatch }) {
  const list = task.checklist || []
  const done = list.filter(c => c.done).length
  const toggle = (id) => onPatch(task.id, { checklist: list.map(c => c.id === id ? { ...c, done: !c.done } : c) })
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {list.map(c => (
        <li key={c.id} className="flex items-start gap-2 text-[13px]">
          <button role="checkbox" aria-checked={c.done} aria-label={`${c.done ? 'Untick' : 'Tick'} ${c.text}`} onClick={() => toggle(c.id)}
            className="-my-[3px] -ml-[5px] grid h-6 w-6 shrink-0 place-items-center">
            <span className="grid h-[13px] w-[13px] place-items-center rounded-[4px] border" style={{ borderColor: c.done ? STATUS.done : 'var(--line-2)', background: c.done ? STATUS.done : 'transparent' }}>
              {c.done && <Check size={9} weight="bold" color="var(--bg)" />}
            </span>
          </button>
          <span style={{ color: c.done ? 'var(--ink-3)' : 'var(--ink-2)', textDecoration: c.done ? 'line-through' : 'none' }}>{c.text}</span>
        </li>
      ))}
      <li className="tnum text-[12px]" style={{ color: 'var(--ink-3)' }}>{done} of {list.length}</li>
    </ul>
  )
}

/**
 * One task. The title gets the whole width: the hover actions float over the top right corner on
 * hover, focus and while editing, instead of reserving a strip that squeezed titles into one word
 * per line in a narrow lane. Details and the drag grip stay inline because they are always there.
 * With focus on the card itself (j and k put it there): e or Enter for details, x to tick,
 * Alt with an arrow to move a lane, Delete to remove.
 */
export default function TaskCard({ task, onPatch, onDelete, draggable = true, focusMinutes: focusProp }) {
  const [editing, setEditing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const from = task.assignedBy || task.meta?.from
  const over = task.dueDate ? -daysUntil(task.dueDate) : null
  const held = task.waitingSince ? daysSince(task.waitingSince) : null
  const cold = task.lane === 'innovation' ? daysSince(task.lastTouched) : null
  const orderIn = task.orderBy ? daysUntil(task.orderBy) : null
  const canDrag = draggable && !task.done && !editing
  const border = task.done || dragging ? null : ageBorder(daysSince(task.lastTouched || task.updatedAt))
  const links = Array.isArray(task.links) ? task.links.filter(l => l && l.href) : []

  const onDragStart = (e) => {
    e.dataTransfer.setData(DRAG_TYPE, task.id)
    e.dataTransfer.setData('text/plain', task.title)
    e.dataTransfer.effectAllowed = 'move'
    setDragging(true)
  }
  const onKey = (e) => {
    if (e.target !== e.currentTarget) return
    const k = e.key
    if (k === 'e' || k === 'Enter') { e.preventDefault(); setEditing(v => !v) }
    else if (k === 'x') { e.preventDefault(); onPatch(task.id, { done: !task.done }) }
    else if (e.altKey && (k === 'ArrowLeft' || k === 'ArrowRight')) {
      const next = LANE_ORDER[LANE_ORDER.indexOf(task.lane) + (k === 'ArrowRight' ? 1 : -1)]
      if (next) { e.preventDefault(); onPatch(task.id, { lane: next }) }
    } else if (k === 'Delete') { e.preventDefault(); if (confirm(`Remove "${task.title}"?`)) onDelete(task.id) }
  }
  const startFocus = () => focus.start({ taskId: task.id, title: task.title, minutes: focusMinutes(focusProp) })

  return (
    <motion.li layout
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: task.done ? .4 : dragging ? .5 : 1, y: 0 }}
      exit={{ opacity: 0, scale: .97, transition: { duration: .15 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      id={`task-${task.id}`} className="group row relative px-4 py-3"
      tabIndex={-1} onKeyDown={onKey} aria-keyshortcuts="e Enter x Alt+ArrowLeft Alt+ArrowRight Delete"
      draggable={canDrag} onDragStart={canDrag ? onDragStart : undefined} onDragEnd={() => setDragging(false)}
      style={{ cursor: canDrag ? 'grab' : 'default', ...(border ? { borderColor: border } : {}) }}>
      <div className="flex items-start gap-3">

        <motion.button role="checkbox" aria-checked={task.done} whileTap={{ scale: .85 }}
          aria-label={`${task.done ? 'Reopen' : 'Complete'} ${task.title}`}
          onClick={() => onPatch(task.id, { done: !task.done })}
          className="-mt-[1px] -ml-[3px] grid h-6 w-6 shrink-0 place-items-center">
          <span className="grid h-[18px] w-[18px] place-items-center rounded-full border transition-colors"
            style={{ borderColor: task.done ? STATUS.done : 'var(--line-2)', background: task.done ? STATUS.done : 'transparent' }}>
            {task.done && <Check size={11} weight="bold" color="var(--bg)" />}
          </span>
        </motion.button>

        <div className="min-w-0 flex-1">
          <p className="cursor-text pr-14 text-[14px] leading-snug" onClick={() => setEditing(v => !v)}
            style={{ textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 empty:hidden">
            {task.priority && <Tag color={PRIO_COLOR[task.priority]}>P{task.priority}</Tag>}
            {ORIGIN[task.source] && <Tag color="var(--accent)">{ORIGIN[task.source]}</Tag>}
            {task.project && <Tag color={STATUS.muted}>{task.project}</Tag>}
            {from && <Tag color={STATUS.muted}>from {from}</Tag>}
            {task.lead && <Tag color={STATUS.muted}>lead {task.lead}</Tag>}
            {task.effortHours ? <Tag color={STATUS.muted}>{task.effortHours}h</Tag> : null}
            {task.repeat && <Tag color={STATUS.muted} title="Completing it creates the next one"><span className="inline-flex items-center gap-1"><ArrowsClockwise size={10} weight="bold" />{task.repeat}</span></Tag>}
            {(task.tags || []).map(t => <Tag key={t} color={STATUS.muted}>{t}</Tag>)}
            {task.planTitle && task.source !== 'qms' && task.source !== 'issues' && <Tag color={STATUS.muted}>{task.planTitle}</Tag>}
            {task.bucketName && <Tag color={STATUS.muted}>{task.bucketName}</Tag>}
            {task.sourceStatus && !task.done && <Tag color={STATUS.muted}>{task.sourceStatus}</Tag>}
            {task.meta?.prio && <Tag color={STATUS.caution}>P{task.meta.prio}</Tag>}
            {task.meta?.priority && /high/i.test(task.meta.priority) && <Tag color={STATUS.overdue}>high</Tag>}
            {over > 0 ? <Tag color={STATUS.overdue}>{over}d overdue</Tag>
              : task.dueDate && <Tag color={STATUS.muted}>{fmtDate(task.dueDate)}</Tag>}
            {task.deliveredOn
              ? <Tag color={STATUS.done}>delivered {fmtDate(task.deliveredOn)}</Tag>
              : task.orderedOn
                ? <Tag color={STATUS.done}>ordered {fmtDate(task.orderedOn)}</Tag>
                : orderIn !== null && <Tag color={orderIn < 0 ? STATUS.overdue : orderIn <= 7 ? STATUS.caution : STATUS.muted}>
                  {orderIn < 0 ? 'order date passed' : orderIn === 0 ? 'order today' : `order in ${orderIn}d`}</Tag>}
            {task.supplier && <Tag color={STATUS.muted}>{task.supplier}</Tag>}
            {task.poNumber && <Tag color={STATUS.muted}>PO {task.poNumber}</Tag>}
            {task.waitingOn && <Tag color={STATUS.held}>{task.waitingOn}</Tag>}
            {held !== null && <Tag color={held >= 7 ? STATUS.overdue : STATUS.held}>with them {held}d</Tag>}
            {cold !== null && cold >= 14 && <Tag color={STATUS.caution}>untouched {cold}d</Tag>}
            {links.map((l, i) => (
              <button key={l.id || i} onClick={() => openLink(l.href)} title={l.href} aria-label={`Open ${l.label || l.href}`}
                className="tag -my-[2px] inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium tracking-wide"
                style={{ color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 14%, transparent)' }}>
                <LinkSimple size={11} weight="bold" />{l.label || l.href}
              </button>
            ))}
          </div>
          {task.checklist?.length > 0 && !task.done && <Checklist task={task} onPatch={onPatch} />}
        </div>
      </div>

      {/* Always there: details, and the grip while draggable. Top right, over the title's reserved right padding. */}
      <div className="absolute right-3 top-2.5 flex items-center gap-0.5">
        <button onClick={() => setEditing(v => !v)} aria-label="Edit details" title="Details" aria-expanded={editing}
          className="grid h-6 w-6 place-items-center rounded-md transition-opacity" style={{ color: editing ? 'var(--ink)' : 'var(--ink-3)', opacity: editing ? 1 : .7 }}><SlidersHorizontal size={13} weight="bold" /></button>
        {canDrag && <span aria-hidden="true" className="hidden opacity-0 transition-opacity group-hover:opacity-60 sm:block" style={{ color: 'var(--ink-3)' }}><DotsSixVertical size={13} weight="bold" /></span>}
      </div>
      {/* On hover, on focus, while editing: the rest, as a small toolbar riding the card's top edge so it covers neither title nor chips. */}
      <div className={`row absolute -top-4 right-10 z-10 items-center gap-1 px-1.5 py-1 ${editing ? 'flex' : 'hidden group-hover:flex group-focus-within:flex'}`}
        style={{ borderColor: 'var(--line-2)', boxShadow: '0 8px 24px color-mix(in srgb, var(--glow-dark) 60%, transparent)' }}>
        {!task.done && task.lane !== 'today' && (
          <button onClick={() => onPatch(task.id, { lane: 'today' })} aria-label="Pull to Today" title="Pull to Today"
            className="pill inline-flex h-6 items-center px-2 text-[12px] font-medium" style={{ border: '1px solid var(--line-2)', color: 'var(--ink-2)' }}>Today</button>
        )}
        {!task.done && task.lane === 'today' && (
          <button onClick={startFocus} aria-label={`Focus on ${task.title}`} title={`Focus, ${focusMinutes(focusProp)} minutes`}
            className="pill inline-flex h-6 items-center gap-1 px-2 text-[12px] font-medium" style={{ border: '1px solid var(--line-2)', color: 'var(--ink-2)' }}><Timer size={12} weight="bold" />Focus</button>
        )}
        {task.url && <button onClick={() => openExternal(task.url)} aria-label="Open in the tool" title="Open in the tool"
          className="grid h-6 w-6 place-items-center rounded-md" style={{ color: 'var(--ink-3)' }}><ArrowSquareOut size={12} weight="bold" /></button>}
        <select aria-label="Move to lane" value={task.lane}
          onChange={e => onPatch(task.id, { lane: e.target.value })}
          className="field cursor-pointer px-1.5 py-0.5 text-[12px]">
          {LANE_ORDER.map(k => <option key={k} value={k}>{LANES[k].label}</option>)}
        </select>
        <button onClick={() => onDelete(task.id)} aria-label="Delete"
          className="grid h-6 w-6 place-items-center rounded-md" style={{ color: 'var(--ink-3)' }}>
          <X size={12} weight="bold" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {editing && <TaskEditor key="ed" task={task} onPatch={onPatch} onClose={() => setEditing(false)} />}
      </AnimatePresence>
    </motion.li>
  )
}
