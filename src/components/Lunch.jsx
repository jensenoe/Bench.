import { motion } from 'motion/react'
import Photo from './Photo.jsx'
import { fmt, mmss, hm, workedMs } from '../hooks/useTimeclock.js'

/**
 * The break screen. A village at dusk, one large number, nothing else asking for attention.
 * On break: minutes gone and the minute it ends. Not yet: the one button that starts it.
 */
export default function Lunch({ clock, punch, now, scene }) {
  const onBreak = clock?.status === 'lunch'
  const started = onBreak && clock.lunch?.startedAt ? new Date(clock.lunch.startedAt) : null
  const [eh, em] = /^\d{1,2}:\d{2}$/.test(clock?.lunch?.endsAt || '') ? clock.lunch.endsAt.split(':').map(Number) : [12, 30]
  const ends = new Date(now); ends.setHours(eh, em, 0, 0)
  const autoEnd = onBreak && clock.lunch?.autoEnd
  const elapsed = started ? now.getTime() - started.getTime() : 0
  const remaining = ends.getTime() - now.getTime()
  const lastBreak = clock?.events.filter(e => e.kind === 'lunchIn').at(-1)
  const solid = { background: 'var(--accent)', color: 'var(--accent-ink)' }

  return (
    <section className="on-photo relative isolate min-h-[100svh] overflow-hidden">
      <Photo animated key={scene.terrain} src={scene.terrain} fallback={scene.fallback}
        initial={{ scale: 1.08, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
        className="photo absolute inset-0 h-full w-full object-cover object-center" />
      <div className="pointer-events-none absolute inset-0" style={{
        background: 'linear-gradient(to top, rgba(var(--veil),.96) 0%, rgba(var(--veil),.55) 35%, rgba(var(--veil),.15) 70%, rgba(var(--veil),.35) 100%)' }} />

      <div className="relative z-10 mx-auto flex min-h-[100svh] col flex-col justify-end px-6 pb-24 pt-32">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, delay: .2, ease: [0.16, 1, 0.3, 1] }} className="glass w-fit max-w-full px-8 py-7 sm:px-10 sm:py-8">
          {onBreak ? (
            <>
              <p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>{started ? `Out since ${fmt(started.toISOString())}` : 'On break'}{autoEnd ? `, back at ${clock.lunch.endsAt}` : ', back when you say'}</p>
              <p className="display tnum mt-3 text-[clamp(88px,16vw,200px)] font-semibold leading-[.9] tracking-tight">{mmss(elapsed)}</p>
              <div className="mt-8 flex flex-wrap items-center gap-6">
                <button onClick={() => punch('lunchIn')} className="pill px-6 py-3 text-[14px] font-medium" style={solid}>Back early</button>
                {autoEnd && remaining > 0 && <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{mmss(remaining)} until the sheet closes the break by itself</span>}
                <a href="#/" className="text-[13px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}>Leave this open, go to the board</a>
              </div>
            </>
          ) : clock?.status === 'in' ? (
            <>
              <p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>{hm(workedMs(clock, now))} on the clock since {fmt(clock.events.find(e => e.kind === 'in')?.at)}</p>
              <h1 className="display mt-3 text-[clamp(48px,8vw,104px)] font-semibold leading-[.95] tracking-tight">Lunch.</h1>
              <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                Clocking out writes the minute to the sheet, rounded down to five. The break ends at {clock.lunch?.endsAt || '12:30'} on its own if it started before then.
              </p>
              <div className="mt-8 flex items-center gap-6">
                {clock.events.some(e => e.kind === 'lunchOut')
                  ? <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Today's break is already in the sheet ({fmt(lastBreak?.at)}).</span>
                  : <button onClick={async () => { await punch('lunchOut') }} className="pill px-6 py-3 text-[14px] font-medium" style={solid}>Clock out for lunch</button>}
                <a href="#/" className="text-[13px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}>Not now</a>
              </div>
            </>
          ) : (
            <>
              <h1 className="display text-[clamp(48px,8vw,104px)] font-semibold leading-[.95] tracking-tight">{clock?.status === 'out' ? 'Day closed.' : 'Not clocked in.'}</h1>
              <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                {clock?.status === 'out' ? `Out at ${fmt(clock.events.filter(e => e.kind === 'out').at(-1)?.at)}. ${hm(workedMs(clock, now))} today.` : 'Clock in from the top bar and the break can be recorded from here.'}
              </p>
              <a href="#/" className="mt-8 inline-block text-[13px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}>Back to the board</a>
            </>
          )}
        </motion.div>

        <ul className="mt-16 flex flex-wrap gap-x-8 gap-y-2 text-[12px]" style={{ color: 'var(--ink-3)' }}>
          {(clock?.events || []).filter(e => e.kind !== 'pause').map((e, i) => (
            <li key={i} className="tnum">
              {{ in: 'In', lunchOut: 'Lunch', lunchIn: 'Back', out: 'Out' }[e.kind]} {e.label}
              <span className="ml-1.5" style={{ color: e.error ? '#F0776B' : e.written ? 'var(--ink-3)' : '#E8B85A' }}>
                {e.error ? 'not written' : e.written ? `· ${e.cell}` : '· waiting'}{e.auto ? ' · auto' : ''}
              </span>
            </li>
          ))}
          {clock && <li>{clock.workbook}</li>}
        </ul>
      </div>
    </section>
  )
}
