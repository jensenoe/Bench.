import { useEffect, useRef, useState } from 'react'
import { motion, animate, useInView } from 'motion/react'
import { ArrowRight, ArrowSquareOut } from '@phosphor-icons/react'
import Vista from './Vista.jsx'
import LeadTime from './LeadTime.jsx'
import Photo from './Photo.jsx'
import Week from './Week.jsx'
import { STATUS } from '../scenes.js'
import { openTool } from '../api.js'
import { SHEETS, greeting } from '../copy.js'

const EASE = [0.16, 1, 0.3, 1]

function Figure({ value, label, tone }) {
  const ref = useRef(null), n = useRef(null)
  const seen = useInView(ref, { once: true })
  useEffect(() => {
    if (!seen || !n.current) return
    const c = animate(0, value, { duration: .9, ease: EASE, onUpdate: v => { n.current.textContent = Math.round(v) } })
    return () => c.stop()
  }, [seen, value])
  return (
    <div ref={ref}>
      <div ref={n} className="display tnum text-[44px] font-semibold leading-none sm:text-[56px]" style={{ color: tone || 'var(--ink)' }}>0</div>
      <div className="mt-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>{label}</div>
    </div>
  )
}

function Door({ s, tall = false, wide = false, sheetState, doorImages }) {
  const ready = s.ready !== false
  const st = sheetState[s.id]
  const ext = s.external
  return (
    <motion.a href={ext ? s.external : ready ? `#/${s.id}` : undefined} onClick={ext ? (e => { e.preventDefault(); openTool(s.external) }) : undefined}
      whileHover={ready ? { y: -4 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className={`on-photo group relative isolate flex flex-col justify-end overflow-hidden ${ready ? 'cursor-pointer' : ''}`}
      style={{ borderRadius: 20, border: '1px solid var(--line)', minHeight: tall ? 560 : wide ? 300 : 268, opacity: ready ? 1 : .6 }}>
      <Photo key={doorImages[s.id]?.src || s.image} src={doorImages[s.id]?.src || s.image} fallback={doorImages[s.id]?.fallback || s.fallback}
           className="photo absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-[1600ms] ease-out group-hover:scale-[1.05]" />
      <div className="photo-veil absolute inset-0 -z-10" />
      <div className="p-7">
        <h3 className={`display font-semibold leading-none ${tall ? 'text-[40px]' : 'text-[28px]'}`}>{s.title}.</h3>
        <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-2)' }}>{s.line}</p>
        {(tall || wide) && <p className="mt-3 max-w-[48ch] text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>{s.body}</p>}
        <div className="mt-5 flex items-center justify-between">
          <span className="tnum text-[13.5px]" style={{ color: st?.tone || 'var(--ink-3)' }}>{ext ? 'Opens in its own window, signed in' : ready ? st?.text : 'Not built yet'}</span>
          {ready && <span className="pill grid h-9 w-9 place-items-center transition-transform group-hover:translate-x-1"
                          style={{ background: 'var(--ink)', color: 'var(--bg)' }}>{ext ? <ArrowSquareOut size={15} weight="bold" /> : <ArrowRight size={15} weight="bold" />}</span>}
        </div>
      </div>
    </motion.a>
  )
}

export default function Landing({ scene, stats, pressing, sheetState, doorImages = {}, name, late = false, hoursIn = 0 }) {
  // A fresh line each time you land here, and a new one on the hour; the status line stays live.
  const hour = new Date().getHours()
  const [lead, setLead] = useState(() => greeting(stats, scene, name, { random: true }).lead)
  useEffect(() => { setLead(greeting(stats, scene, name, { random: true }).lead) }, [scene.key, hour, name])   // eslint-disable-line react-hooks/exhaustive-deps
  const [a, b] = lead
  const { state } = greeting(stats, scene, name, { late, hoursIn })
  const [board, proc, bench, logbook, napkin, cockpit] = SHEETS

  return (
    <div>
      <Vista scene={scene}>
        <div className="on-photo mx-auto flex h-full col flex-col justify-end px-6 pb-[14vh]">
          <motion.div initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .9, ease: EASE }}
            className="glass inline-block w-fit max-w-full px-8 py-7 sm:px-10 sm:py-9">
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .9, delay: .1, ease: EASE }}
            className="display max-w-[14ch] text-[48px] leading-[1.02] sm:text-[72px]"
            style={{ textShadow: 'var(--shadow-text)' }}>
            <span className="font-light" style={{ color: 'var(--ink-2)' }}>{a} </span>
            <span className="font-semibold">{b}</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .8, delay: .15, ease: EASE }}
            className="mt-6 max-w-[40ch] text-[17px] leading-relaxed sm:text-[19px]" style={{ color: 'var(--ink-2)', textShadow: 'var(--shadow-text-soft)' }}>
            {state}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .8, delay: .3, ease: EASE }} className="mt-8">
            <a href="#/board" className="pill inline-flex items-center gap-2 px-5 py-2.5 text-[13.5px] font-medium"
               style={{ background: 'var(--ink)', color: 'var(--bg)' }}>Open the board <ArrowRight size={14} weight="bold" /></a>
          </motion.div>
          </motion.div>
        </div>
      </Vista>

      <main className="mx-auto col px-6">
        <section className="grid grid-cols-2 gap-x-8 gap-y-10 py-16 sm:grid-cols-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <Figure value={stats.today} label="on today" tone={stats.today > 5 ? STATUS.overdue : 'var(--accent)'} />
          <Figure value={stats.open} label="open" />
          <Figure value={stats.waiting} label="with other people" />
          <Figure value={stats.pressing} label="order dates this week" tone={stats.pressing ? STATUS.caution : undefined} />
        </section>

        <Week refreshKey={stats.open + ':' + stats.today} />

        {pressing.length > 0 && <div className="mt-16"><LeadTime items={pressing} /></div>}

        <section className="mt-28">
          <h2 className="display text-[36px] font-semibold leading-none sm:text-[48px]">Where to.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-5">
            <div className="md:col-span-3"><Door s={board} tall sheetState={sheetState} doorImages={doorImages} /></div>
            <div className="flex flex-col gap-4 md:col-span-2">
              <Door s={proc} sheetState={sheetState} doorImages={doorImages} />
              <Door s={bench} sheetState={sheetState} doorImages={doorImages} />
            </div>
            <div className="md:col-span-2"><Door s={logbook} sheetState={sheetState} doorImages={doorImages} /></div>
            <div className="md:col-span-3"><Door s={napkin} sheetState={sheetState} doorImages={doorImages} /></div>
            <div className="md:col-span-5"><Door s={cockpit} wide sheetState={sheetState} doorImages={doorImages} /></div>
          </div>
        </section>
      </main>
    </div>
  )
}
