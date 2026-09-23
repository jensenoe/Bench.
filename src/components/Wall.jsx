import { useEffect, useState } from 'react'
import Photo from './Photo.jsx'
import * as api from '../api.js'
import { LANES } from '../copy.js'
import { STATUS } from '../scenes.js'
import { shortDate, daysSince, daysUntil, fmtDate } from '../lanes.js'

/**
 * Wall mode (roadmap 84): the board as a read-only picture for a workshop screen, 3440 px wide and
 * fine at 1920. The scene photograph behind a dark veil, a large clock top right, Today as the first
 * column in big type, the four other lanes beside it. No buttons, no hover, nothing under 16 px.
 * App renders it alone on #/wall; Escape goes back to the board.
 */
const ORDER = ['innovation', 'waiting', 'active', 'parked']
const ORIGIN = { issues: 'Issues', qms: 'QMS', bom: 'BOM', planner: 'Planner' }
const PRIO_COLOR = { 1: STATUS.overdue, 2: STATUS.caution, 3: STATUS.muted }
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

function Chip({ children, color, big }) {
  return (
    <span className={`inline-block rounded-md font-medium leading-none ${big ? 'px-2.5 py-1.5 text-[16px]' : 'px-2 py-1 text-[16px]'}`}
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>{children}</span>
  )
}

/** The few chips that matter from four metres: priority, source, project, due, who has it. */
function chipsFor(t) {
  const out = []
  if (t.priority) out.push({ k: 'p', c: PRIO_COLOR[t.priority], text: `P${t.priority}` })
  if (ORIGIN[t.source]) out.push({ k: 's', c: 'var(--accent)', text: ORIGIN[t.source] })
  if (t.project) out.push({ k: 'pr', c: STATUS.muted, text: t.project })
  if (t.lead) out.push({ k: 'l', c: STATUS.muted, text: `lead ${t.lead}` })
  const over = t.dueDate ? -daysUntil(t.dueDate) : null
  if (over > 0) out.push({ k: 'd', c: STATUS.overdue, text: `${over}d overdue` })
  else if (t.dueDate) out.push({ k: 'd', c: STATUS.muted, text: fmtDate(t.dueDate) })
  const orderIn = t.orderBy && !t.orderedOn ? daysUntil(t.orderBy) : null
  if (orderIn !== null) out.push({ k: 'o', c: orderIn < 0 ? STATUS.overdue : orderIn <= 7 ? STATUS.caution : STATUS.muted, text: orderIn < 0 ? 'order date passed' : orderIn === 0 ? 'order today' : `order in ${orderIn}d` })
  if (t.waitingOn) out.push({ k: 'w', c: STATUS.held, text: t.waitingOn })
  const held = t.waitingSince ? daysSince(t.waitingSince) : null
  if (held !== null) out.push({ k: 'h', c: held >= 7 ? STATUS.overdue : STATUS.held, text: `with them ${held}d` })
  const cold = t.lane === 'innovation' ? daysSince(t.lastTouched) : null
  if (cold !== null && cold >= 14) out.push({ k: 'c', c: STATUS.caution, text: `untouched ${cold}d` })
  return out
}

function Card({ task, big }) {
  const steps = task.checklist?.length ? `${task.checklist.filter(c => c.done).length} of ${task.checklist.length}` : null
  const chips = chipsFor(task)
  return (
    <li className={`row ${big ? 'px-6 py-5' : 'px-5 py-4'}`} style={{ background: 'rgba(var(--veil),.55)', borderColor: 'rgba(var(--ink-rgb),.1)' }}>
      <p className={`leading-snug ${big ? 'text-[28px]' : 'text-[18px]'}`}>{task.title}</p>
      {(chips.length > 0 || steps) && (
        <div className={`flex flex-wrap items-center ${big ? 'mt-3 gap-2' : 'mt-2 gap-1.5'}`}>
          {chips.map(c => <Chip key={c.k} color={c.c} big={big}>{c.text}</Chip>)}
          {steps && <span className="tnum text-[16px]" style={{ color: 'var(--ink-3)' }}>{steps}</span>}
        </div>
      )}
    </li>
  )
}

function Column({ laneKey, tasks, big }) {
  const lane = LANES[laneKey]
  const open = tasks.filter(t => !t.done).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const overCap = lane.cap && open.length > lane.cap
  return (
    <section aria-labelledby={`wall-${laneKey}`} className="glass flex min-h-0 flex-col p-6 2xl:p-7">
      <header className="flex items-baseline justify-between gap-4">
        <h2 id={`wall-${laneKey}`} className={`display font-semibold leading-none ${big ? 'text-[44px] 2xl:text-[52px]' : 'text-[28px] 2xl:text-[32px]'}`} style={{ textShadow: 'var(--shadow-text-soft)' }}>{lane.label}.</h2>
        <span className={`tnum ${big ? 'text-[24px]' : 'text-[18px]'}`} style={{ color: overCap ? STATUS.overdue : 'var(--ink-3)' }}>{open.length}{lane.cap ? ` of ${lane.cap}` : ''}</span>
      </header>
      <ul className={`mt-5 flex flex-col ${big ? 'gap-3' : 'gap-2'}`}>
        {open.map(t => <Card key={t.id} task={t} big={big} />)}
      </ul>
      {open.length === 0 && <p className="mt-5 text-[18px]" style={{ color: 'var(--ink-3)' }}>{laneKey === 'today' ? 'Nothing on Today yet.' : 'Empty.'}</p>}
    </section>
  )
}

export default function Wall({ scene, settings }) {
  const [tasks, setTasks] = useState(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  useEffect(() => {
    let on = true
    const load = () => api.getState().then(s => on && setTasks(s.tasks)).catch(() => {})
    load()
    const id = setInterval(load, 60_000)
    addEventListener('bench:refresh', load)
    return () => { on = false; clearInterval(id); removeEventListener('bench:refresh', load) }
  }, [])
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') location.hash = '#/board' }
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey)
  }, [])

  const byLane = k => (tasks || []).filter(t => t.lane === k)
  const [day, ...rest] = shortDate(now).split(' ')
  const todayOpen = byLane('today').filter(t => !t.done).length

  return (
    <div className="on-photo relative isolate min-h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Photo key={scene.terrain} src={scene.terrain} fallback={scene.fallback} className="photo fixed inset-0 h-full w-full object-cover object-center" />
      <div aria-hidden="true" className="grade fixed inset-0" />
      <div aria-hidden="true" className="grain fixed inset-0" />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0" style={{ background: 'linear-gradient(to bottom, rgba(var(--veil),.72) 0%, rgba(var(--veil),.62) 50%, rgba(var(--veil),.8) 100%)' }} />

      <div className="relative z-10 flex min-h-screen flex-col px-8 pb-10 pt-8 2xl:px-12 2xl:pt-10">
        <header className="flex items-start justify-between gap-8">
          <div>
            <h1 className="display text-[40px] font-semibold leading-none 2xl:text-[48px]" style={{ textShadow: 'var(--shadow-text)' }}>
              Bench<span style={{ color: 'var(--accent)' }}>.</span>
            </h1>
            <p className="mt-2 text-[18px] 2xl:text-[20px]" style={{ color: 'var(--ink-2)', textShadow: 'var(--shadow-text-soft)' }}>
              {settings?.name ? `${settings.name.split(/\s+/)[0]}'s board. ` : ''}{todayOpen} of 5 on today{tasks ? `, ${tasks.filter(t => !t.done).length} open.` : '.'}
            </p>
          </div>
          <div className="text-right" style={{ textShadow: 'var(--shadow-text)' }}>
            <p className="display tnum text-[88px] font-semibold leading-none tracking-tight 2xl:text-[112px]">{hhmm(now)}</p>
            <p className="tnum mt-2 text-[24px] 2xl:text-[28px]" style={{ color: 'var(--ink-2)' }}>{day} <span style={{ color: 'var(--ink)' }}>{rest.join(' ')}</span> <span className="ml-3" style={{ color: 'var(--ink-3)' }}>{scene.label}</span></p>
          </div>
        </header>

        <main aria-label="Board" className="mt-8 grid flex-1 items-start gap-5 2xl:mt-10 2xl:gap-6"
          style={{ gridTemplateColumns: 'minmax(0, 1.7fr) repeat(4, minmax(0, 1fr))' }}>
          <Column laneKey="today" tasks={byLane('today')} big />
          {ORDER.map(k => <Column key={k} laneKey={k} tasks={byLane(k)} />)}
        </main>

        <p className="mt-8 text-[16px]" style={{ color: 'var(--ink-3)', textShadow: 'var(--shadow-text-soft)' }}>Read only. Escape goes back to the board. Refreshes every minute.</p>
      </div>
    </div>
  )
}
