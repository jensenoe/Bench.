import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import TaskCard, { DRAG_TYPE } from './TaskCard.jsx'
import AddTask from './AddTask.jsx'
import Capacity from './Capacity.jsx'
import { LANES } from '../copy.js'
import { STATUS } from '../scenes.js'
import { daysSince } from '../lanes.js'

/** One lane. A card dragged in from another lane lands here; the panel lights up while it hovers. */
export default function Lane({ laneKey, tasks, onPatch, onDelete, onCreate, wide = false, span = '' }) {
  const lane = LANES[laneKey]
  const [over, setOver] = useState(false)
  const open = tasks.filter(t => !t.done), done = tasks.filter(t => t.done)
  const overCap = lane.cap && open.length > lane.cap
  const full = lane.cap && open.length >= lane.cap
  const coldest = laneKey === 'innovation' && open.length ? Math.max(...open.map(t => daysSince(t.lastTouched) ?? 0)) : null

  const accepts = (e) => [...(e.dataTransfer?.types || [])].includes(DRAG_TYPE)
  const onDragOver = (e) => { if (!accepts(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!over) setOver(true) }
  const onDrop = (e) => {
    if (!accepts(e)) return
    e.preventDefault(); setOver(false)
    const id = e.dataTransfer.getData(DRAG_TYPE)
    if (id && !tasks.some(t => t.id === id)) onPatch(id, { lane: laneKey })
  }

  return (
    <section className={`panel p-6 transition-colors sm:p-7 ${wide ? 'lg:col-span-2' : ''} ${span}`}
      onDragOver={onDragOver} onDragEnter={onDragOver} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false) }} onDrop={onDrop}
      style={over ? { borderColor: full ? STATUS.overdue : 'var(--accent)', background: `color-mix(in srgb, ${full ? STATUS.overdue : 'var(--accent)'} 6%, var(--panel))` } : undefined}>
      <header className="flex items-baseline justify-between gap-4">
        <h2 className={`display font-semibold leading-none ${wide ? 'text-[30px]' : 'text-[22px]'}`}>{lane.label}.</h2>
        <span className="tnum text-[13.5px]" style={{ color: overCap ? STATUS.overdue : 'var(--ink-3)' }}>
          {open.length}{lane.cap ? ` of ${lane.cap}` : ''}
        </span>
      </header>
      <p className="mt-1.5 max-w-[60ch] text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>{lane.blurb}</p>
      {laneKey === 'today' && <Capacity refreshKey={`${tasks.length}:${tasks.reduce((m, t) => (t.updatedAt || '') > m ? t.updatedAt : m, '')}`} />}

      {overCap && <p className="mt-3 text-[13px] leading-snug" style={{ color: STATUS.overdue }}>
        {open.length} on Today. Your week has about three working days in it. Move {open.length - lane.cap} back to Active.
      </p>}
      {over && full && !overCap && <p className="mt-3 text-[13px] leading-snug" style={{ color: STATUS.overdue }}>Today is full. Something has to leave first.</p>}
      {coldest !== null && coldest >= 14 && <p className="mt-3 text-[13px]" style={{ color: STATUS.caution }}>
        Nothing here has moved in {coldest} days.
      </p>}

      <ul className="mt-4 flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {open.map(t => <TaskCard key={t.id} task={t} onPatch={onPatch} onDelete={onDelete} />)}
        </AnimatePresence>
      </ul>
      {open.length === 0 && <p className="py-5 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>
        {laneKey === 'today' ? 'Nothing here yet. Pull from Active, or drop a card here.' : 'Empty.'}
      </p>}
      <div className="mt-3"><AddTask lane={laneKey} onCreate={onCreate} /></div>
      {done.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer select-none text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{done.length} complete</summary>
          <ul className="mt-2 flex flex-col gap-2">{done.map(t => <TaskCard key={t.id} task={t} onPatch={onPatch} onDelete={onDelete} />)}</ul>
        </details>
      )}
    </section>
  )
}
