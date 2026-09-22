import { useState } from 'react'
import { fmt, mmss } from '../hooks/useTimeclock.js'

const PillBtn = ({ kind, style, children, busy, go }) => (
  <button disabled={busy} onClick={() => go(kind)} className="pill px-4.5 py-2.5 text-[13.5px] font-medium transition-opacity disabled:opacity-50 2xl:px-5 2xl:py-3 2xl:text-[15px]" style={style}>{children}</button>
)
const TextBtn = ({ kind, children, busy, go }) => (
  <button disabled={busy} onClick={() => go(kind)} className="text-[13.5px] underline-offset-2 hover:underline disabled:opacity-50 2xl:text-[15px]" style={{ color: 'var(--ink-3)' }}>{children}</button>
)

/**
 * The time clock in the nav: one primary pill, one quiet text action.
 * Which is which follows the hour, so at noon the pill says Lunch and at five it says Clock out.
 */
export default function Punch({ clock, punch, now }) {
  const [busy, setBusy] = useState(false)
  if (!clock) return null
  const go = async (kind) => { setBusy(true); try { if (await punch(kind) && kind === 'lunchOut') location.hash = '#/lunch' } finally { setBusy(false) } }
  const last = k => clock.events.filter(e => e.kind === k).at(-1)
  const solid = { background: 'var(--accent)', color: 'var(--accent-ink)' }
  const ghost = { border: '1px solid var(--line-2)' }
  const quiet = { color: 'var(--ink-3)' }
  const noonish = now.getHours() >= 11 && now.getHours() < 14 && !last('lunchOut')
  const pending = clock.pending > 0
  const dot = (pending || clock.lastError) && (
    <span title={clock.lastError || `${clock.pending} punch${clock.pending > 1 ? 'es' : ''} waiting to be written`}
          className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: clock.lastError ? '#F0776B' : '#E8B85A' }} />
  )

  if (clock.status === 'off') return (
    <div className="flex items-center gap-3">{dot}<PillBtn busy={busy} go={go} kind="in" style={solid}>Clock in</PillBtn></div>
  )
  if (clock.status === 'in') return (
    <div className="flex items-center gap-4">
      <span className="tnum hidden text-[13.5px] min-[1400px]:inline" style={quiet}>In {fmt(last('lunchIn')?.at || last('in')?.at)}</span>
      {dot}
      {noonish ? <><TextBtn busy={busy} go={go} kind="out">Clock out</TextBtn><PillBtn busy={busy} go={go} kind="lunchOut" style={solid}>Lunch</PillBtn></>
               : <>{!last('lunchOut') && <TextBtn busy={busy} go={go} kind="lunchOut">Lunch</TextBtn>}<PillBtn busy={busy} go={go} kind="out" style={ghost}>Clock out</PillBtn></>}
    </div>
  )
  if (clock.status === 'lunch') {
    const since = new Date(clock.lunch.startedAt).getTime()
    return (
      <div className="flex items-center gap-4">
        <a href="#/lunch" className="tnum text-[13.5px]" style={quiet}>Break {mmss(now.getTime() - since)}</a>
        {dot}
        <PillBtn busy={busy} go={go} kind="lunchIn" style={solid}>Back</PillBtn>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-4">
      <span className="tnum text-[13.5px]" style={quiet}>Out {fmt(last('out')?.at)}</span>
      {dot}
      <TextBtn busy={busy} go={go} kind="in">Clock in again</TextBtn>
    </div>
  )
}
