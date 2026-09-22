import { AnimatePresence } from 'motion/react'
import TaskCard from './TaskCard.jsx'
import AddTask from './AddTask.jsx'
import { LANES } from '../copy.js'
import { STATUS } from '../scenes.js'
import { daysSince } from '../lanes.js'

export default function Lane({ laneKey, tasks, onPatch, onDelete, onCreate, wide = false }) {
  const lane = LANES[laneKey]
  const open = tasks.filter(t => !t.done), done = tasks.filter(t => t.done)
  const over = lane.cap && open.length > lane.cap
  const coldest = laneKey === 'innovation' && open.length ? Math.max(...open.map(t => daysSince(t.lastTouched) ?? 0)) : null

  return (
    <section className={`panel p-6 sm:p-7 ${wide ? 'lg:col-span-2' : ''}`}>
      <header className="flex items-baseline justify-between gap-4">
        <h2 className={`display font-semibold leading-none ${wide ? 'text-[30px]' : 'text-[22px]'}`}>{lane.label}.</h2>
        <span className="tnum text-[13px]" style={{ color: over ? STATUS.overdue : 'var(--ink-3)' }}>
          {open.length}{lane.cap ? ` of ${lane.cap}` : ''}
        </span>
      </header>
      <p className="mt-1.5 max-w-[60ch] text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>{lane.blurb}</p>

      {over && <p className="mt-3 text-[12.5px] leading-snug" style={{ color: STATUS.overdue }}>
        {open.length} on Today. Your week has about three working days in it. Move {open.length - lane.cap} back to Active.
      </p>}
      {coldest !== null && coldest >= 14 && <p className="mt-3 text-[12.5px]" style={{ color: STATUS.caution }}>
        Nothing here has moved in {coldest} days.
      </p>}

      <ul className="mt-4 flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {open.map(t => <TaskCard key={t.id} task={t} onPatch={onPatch} onDelete={onDelete} />)}
        </AnimatePresence>
      </ul>
      {open.length === 0 && <p className="py-5 text-center text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
        {laneKey === 'today' ? 'Nothing here yet. Pull from Active.' : 'Empty.'}
      </p>}
      <div className="mt-3"><AddTask lane={laneKey} onCreate={onCreate} /></div>
      {done.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11.5px] select-none" style={{ color: 'var(--ink-3)' }}>{done.length} complete</summary>
          <ul className="mt-2 flex flex-col gap-2">{done.map(t => <TaskCard key={t.id} task={t} onPatch={onPatch} onDelete={onDelete} />)}</ul>
        </details>
      )}
    </section>
  )
}
