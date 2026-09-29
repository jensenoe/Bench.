import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Check, X, ArrowSquareOut, SlidersHorizontal, DotsSixVertical, DotsThree, ArrowsClockwise, Timer, LinkSimple, BellSimple } from '@phosphor-icons/react'
import { remindLabel } from '../remind.js'
import TaskEditor from './TaskEditor.jsx'
import { openExternal, openLink } from '../api.js'
import { LANES } from '../copy.js'
import { STATUS } from '../scenes.js'
import { daysSince, daysUntil, fmtDate } from '../lanes.js'
import * as focus from '../focus.js'
import { ask } from './Confirm.jsx'

const LANE_ORDER = ['today', 'innovation', 'waiting', 'active', 'parked']
const ORIGIN = { issues: 'Issues', qms: 'QMS', bom: 'BOM', planner: 'Planner' }
export const DRAG_TYPE = 'text/bench-task'

function Tag({ children, color, title }) {
  return (
    <span title={title || (typeof children === 'string' ? children : undefined)} className={`tag rounded-md px-1.5 py-[2px] text-[12px] font-medium tracking-wide ${color === STATUS.muted ? 'tag-plain' : ''}`}
      style={{ color, background: color === STATUS.muted ? 'transparent' : `color-mix(in srgb, ${color} 14%, transparent)` }}>
      {children}
    </span>
  )
}

const PRIO_COLOR = { 1: STATUS.overdue, 2: STATUS.caution, 3: STATUS.muted }

// Size the day (roadmap 106): the four sizes a task can take from the card, in hours.
const SIZES = [0.5, 1, 2, 4]
const sizeLabel = h => h === 0.5 ? '½h' : `${h}h`
const sizeWords = h => h === 0.5 ? 'half an hour' : h === 1 ? 'one hour' : h === 2 ? 'two hours' : h === 4 ? 'four hours' : `${h} hours`
/** After ½, 1, 2 and 4 comes clear; a size typed by hand steps up to the next one, or clears when past 4. */
export const nextSize = h => SIZES.find(s => s > h) ?? null

/** Four quiet chips on an unsized open task; on a sized one a single chip that cycles ½, 1, 2, 4, clear. */
function SizeChips({ task, onPatch }) {
  const chip = 'tag inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[12px] font-medium tracking-wide'
  const style = { color: STATUS.muted, background: `color-mix(in srgb, ${STATUS.muted} 14%, transparent)` }
  const h = Number(task.effortHours) || 0
  if (!h) {
    return SIZES.map(s => (
      <button key={s} onClick={() => onPatch(task.id, { effortHours: s })} aria-label={`Size: ${sizeWords(s)}`} title={`Size: ${sizeWords(s)}`} className={chip} style={style}>{sizeLabel(s)}</button>
    ))
  }
  const next = nextSize(h)
  return (
    <button onClick={() => onPatch(task.id, { effortHours: next })} className={chip} style={style}
      aria-label={`Size: ${sizeWords(h)}. Next: ${next ? sizeWords(next) : 'no size'}`} title={next ? `Size: ${sizeWords(h)}, click for ${sizeWords(next)}` : `Size: ${sizeWords(h)}, click to clear`}>{sizeLabel(h)}</button>
  )
}

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
  // The actions (Today, focus, size, lane, open, delete) open from the ⋯ button, never on hover over the text (roadmap 154).
  const [menu, setMenu] = useState(false)
  const menuRef = useRef(null)
  useEffect(() => {
    if (!menu) return
    const down = e => { if (!menuRef.current?.contains(e.target)) setMenu(false) }
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(false) } }
    addEventListener('pointerdown', down, true); addEventListener('keydown', key, true)
    return () => { removeEventListener('pointerdown', down, true); removeEventListener('keydown', key, true) }
  }, [menu])
  const [dragging, setDragging] = useState(false)
  const detailsBtn = useRef(null)
  // Closing the details (Close, Escape) hands focus back to the button that opened them, not to the page top.
  const closeEditor = () => { setEditing(false); setTimeout(() => detailsBtn.current?.focus({ preventScroll: true }), 0) }
  // A removed card takes focus with it; pass it to the card below (or above), or to the lane's heading.
  const remove = () => {
    const li = document.getElementById(`task-${task.id}`)
    if (li && li.contains(document.activeElement)) {
      const sib = [li.nextElementSibling, li.previousElementSibling].find(el => el && el.id?.startsWith('task-'))
      const target = sib || li.closest('section')?.querySelector('h2')
      if (target) { if (!sib) target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }) }
    }
    onDelete(task.id)
  }
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
    // After the confirm has handed focus back to this card, so remove() can pass it on to the next one.
    } else if (k === 'Delete') { e.preventDefault(); ask(`Remove "${task.title}"?`, { yes: 'Remove' }).then(ok => { if (ok) setTimeout(remove, 0) }) }
  }
  const startFocus = () => focus.start({ taskId: task.id, title: task.title, minutes: focusMinutes(focusProp) })

  const actions = (
    <>
      {!task.done && task.lane !== 'today' && (
          <button onClick={() => onPatch(task.id, { lane: 'today' })} aria-label="Pull to Today" title="Pull to Today"
            className="pill btn-quiet inline-flex h-6 items-center px-2 text-[12px] font-medium">Today</button>
      )}
      {!task.done && task.lane === 'today' && (
          <button onClick={startFocus} aria-label={`Focus on ${task.title}`} title={`Focus, ${focusMinutes(focusProp)} minutes`}
            className="pill btn-quiet inline-flex h-6 items-center gap-1 px-2 text-[12px] font-medium"><Timer size={12} weight="bold" />Focus</button>
      )}
      {!task.done && <SizeChips task={task} onPatch={onPatch} />}
      {task.url && <button onClick={() => openExternal(task.url)} aria-label="Open in the tool" title="Open in the tool"
          className="grid h-6 w-6 place-items-center rounded-md" style={{ color: 'var(--ink-3)' }}><ArrowSquareOut size={12} weight="bold" /></button>}
        <select aria-label="Move to lane" value={task.lane}
          onChange={e => onPatch(task.id, { lane: e.target.value })}
          className="field cursor-pointer px-1.5 py-0.5 text-[12px]">
          {LANE_ORDER.map(k => <option key={k} value={k}>{LANES[k].label}</option>)}
        </select>
        <button onClick={remove} aria-label={`Delete ${task.title}`} title="Delete"
          className="grid h-6 w-6 place-items-center rounded-md" style={{ color: 'var(--ink-3)' }}>
          <X size={12} weight="bold" />
        </button>
    </>
  )
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
          aria-label={`${task.done ? 'Reopen' : 'Tick'} ${task.title}`}
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
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 empty:hidden">
            {task.remindAt && !task.done && (
              <button onClick={() => setEditing(true)} title="Reminder. Details to change or clear it" aria-label={`Reminder at ${remindLabel(task.remindAt)}. Open the details to change it`}
                className="tag -my-[2px] inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium tracking-wide tnum"
                style={{ color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 14%, transparent)' }}>
                <BellSimple size={11} weight="bold" />{remindLabel(task.remindAt)}
              </button>
            )}
            {task.priority && <Tag color={PRIO_COLOR[task.priority]}>P{task.priority}</Tag>}
            {ORIGIN[task.source] && (task.url
              ? <button onClick={() => openExternal(task.url)} title={`Open in ${ORIGIN[task.source]}`} aria-label={`Open ${task.title} in ${ORIGIN[task.source]}`}
                  className="tag -my-[2px] inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium tracking-wide"
                  style={{ color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 14%, transparent)' }}>{ORIGIN[task.source]}<ArrowSquareOut size={10} weight="bold" aria-hidden="true" /></button>
              : <Tag color="var(--accent)">{ORIGIN[task.source]}</Tag>)}
            {task.project && <Tag color={STATUS.muted}>{task.project}</Tag>}
            {from && <Tag color={STATUS.muted}>from {from}</Tag>}
            {task.lead && <Tag color={STATUS.muted}>lead {task.lead}</Tag>}
            {task.effortHours ? <Tag color={STATUS.muted}>{task.effortHours}h</Tag> : null}
            {task.repeat && <Tag color={STATUS.muted} title="Completing it creates the next one"><span className="inline-flex items-center gap-1"><ArrowsClockwise size={10} weight="bold" />{task.repeat}</span></Tag>}
            {(task.tags || []).map(t => <Tag key={t} color={STATUS.muted}>{t}</Tag>)}
            {task.planTitle && task.source !== 'qms' && task.source !== 'issues' && <Tag color={STATUS.muted}>{task.planTitle}</Tag>}
            {task.bucketName && <Tag color={STATUS.muted} title={task.bucketName}>{task.bucketName.replace(/\s*\([^)]*\)\s*$/, '')}</Tag>}
            {task.sourceStatus && !task.done && <Tag color={STATUS.muted}>{task.sourceStatus}</Tag>}
            {task.meta?.prio && !task.priority && <Tag color={STATUS.caution} title={`P${task.meta.prio} in ${ORIGIN[task.source] || task.source}`}>P{task.meta.prio}</Tag>}
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
      <div ref={menuRef} className="absolute right-3 top-2.5 flex items-center gap-0.5">
        {!editing && <button onClick={() => setMenu(v => !v)} aria-label={`Actions for ${task.title}`} title="Actions" aria-expanded={menu} aria-haspopup="true"
          className="grid h-6 w-6 place-items-center rounded-md" style={{ color: menu ? 'var(--ink)' : 'var(--ink-3)' }}><DotsThree size={15} weight="bold" /></button>}
        {menu && !editing && (
          <div role="group" aria-label={`Actions for ${task.title}`} className="row absolute right-0 top-8 z-20 flex w-max max-w-[min(560px,calc(100vw-48px))] flex-wrap items-center gap-1 px-1.5 py-1"
            style={{ borderColor: 'var(--line-2)', boxShadow: 'var(--shadow-pop)' }}>
            {actions}
          </div>
        )}
        <button ref={detailsBtn} onClick={() => setEditing(v => !v)} aria-label="Edit details" title="Details" aria-expanded={editing}
          className="grid h-6 w-6 place-items-center rounded-md transition-opacity" style={{ color: editing ? 'var(--ink)' : 'var(--ink-3)' }}><SlidersHorizontal size={13} weight="bold" /></button>
        {canDrag && <span aria-hidden="true" className="hidden opacity-0 transition-opacity group-hover:opacity-60 sm:block" style={{ color: 'var(--ink-3)' }}><DotsSixVertical size={13} weight="bold" /></span>}
      </div>
      {/* While the details are open the same actions sit inside them (roadmap 146); otherwise they open from the ⋯ button (154). */}

      <AnimatePresence initial={false}>
        {editing && <TaskEditor key="ed" task={task} onPatch={onPatch} onClose={closeEditor} toolbar={actions} />}
      </AnimatePresence>
    </motion.li>
  )
}
