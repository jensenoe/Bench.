import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Stop } from '@phosphor-icons/react'
import * as focus from '../focus.js'
import { getState, patchTask } from '../api.js'

const toast = (text, by) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true } }))

/**
 * The focus timer as a pill in the nav (roadmap 82): "24:59 · title", pause and stop. Hidden when idle.
 * When it runs out the task gets the time as effort (to a quarter hour), a toast and a system notification.
 */
export default function FocusTimer() {
  const [s, setS] = useState(focus.get)
  const [left, setLeft] = useState(() => focus.remaining())
  const finishing = useRef(false)
  useEffect(() => focus.subscribe(next => { setS(next); setLeft(focus.remaining(next)) }), [])
  useEffect(() => {
    if (!s || s.pausedAt) return
    const id = setInterval(() => setLeft(focus.remaining()), 500)
    return () => clearInterval(id)
  }, [s])
  useEffect(() => {
    if (!s || s.pausedAt || left > 0 || finishing.current) return
    finishing.current = true
    const done = focus.stop()
    finish(done).finally(() => { finishing.current = false })
  }, [left, s])
  if (!s) return null

  const label = `${focus.mmss(left)} · ${s.title}`
  const btn = 'grid h-6 w-6 place-items-center rounded-full transition-colors hover:bg-[rgba(var(--ink-rgb),.08)]'
  return (
    <div role="timer" aria-live="off" aria-label={`Focus, ${focus.mmss(left)} left on ${s.title}`} title={label}
      className="pill flex items-center gap-1 py-1 pl-3 pr-1 text-[13.5px] 2xl:text-[15px]" style={{ border: '1px solid var(--line-2)', color: s.pausedAt ? 'var(--ink-3)' : 'var(--ink)' }}>
      <span className="tnum max-w-[220px] truncate">{focus.mmss(left)} <span style={{ color: 'var(--ink-3)' }}>· {s.title}</span></span>
      <button onClick={() => (s.pausedAt ? focus.resume() : focus.pause())} aria-label={s.pausedAt ? 'Resume the focus timer' : 'Pause the focus timer'} title={s.pausedAt ? 'Resume' : 'Pause'} className={btn} style={{ color: 'var(--ink-2)' }}>
        {s.pausedAt ? <Play size={12} weight="bold" /> : <Pause size={12} weight="bold" />}
      </button>
      <button onClick={() => { focus.stop(); toast('Focus stopped.', s.title) }} aria-label="Stop the focus timer" title="Stop" className={btn} style={{ color: 'var(--ink-2)' }}><Stop size={12} weight="bold" /></button>
    </div>
  )
}

/** The timer ran out: book the minutes on the task, say so, ask the board to refresh. */
async function finish(done) {
  if (!done) return
  const { taskId, title, minutes } = done
  try {
    const task = (await getState().catch(() => null))?.tasks?.find(t => t.id === taskId)
    if (task && !task.done) await patchTask(taskId, { effortHours: focus.addEffort(task.effortHours, minutes) })
  } catch (err) { window.bench?.log?.(`focus: could not book ${minutes} min on ${taskId}: ${err.message}`) }
  toast('Focus done.', `${minutes} minutes on ${title}`)
  try { window.bench?.notify?.({ title: 'Focus done.', body: title, route: '#/board' }) } catch { /* not the desktop */ }
  window.dispatchEvent(new Event('bench:refresh'))
}
