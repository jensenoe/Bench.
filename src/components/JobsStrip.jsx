import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, WarningCircle } from '@phosphor-icons/react'
import { getJobs } from '../api/jobs.js'
import { STATUS } from '../scenes.js'
import { fmtDate } from '../lanes.js'
import LoadFailed from './LoadFailed.jsx'
import { Bar } from './Skeleton.jsx'

/**
 * Jobs first (roadmap 175): every open Paket and E2E, and a plain plan whose date is close, in one panel. Each
 * row says the kind, the name, the working days left, where it stands on its steps, the one thing to do now, and
 * quietly the open questions and the kit. A row opens its plan, on the Rüsten tab when the next thing is kitting.
 * The order and the sentences come from server/jobs.js. On Home at most five rows and "All jobs"; on Projects
 * (`full`) every job.
 */
const EASE = [0.16, 1, 0.3, 1]
const MAX_HOME = 5
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const first = s => String(s || '').trim().split(/\s+/)[0] || ''

/** "today", "2 working days", "3 working days late", and the tone that goes with it. */
export function countdown(j) {
  if (j.daysLeft === null || j.daysLeft === undefined) return { text: 'no date yet', tone: 'var(--ink-3)' }
  if (j.daysLeft < 0) return { text: `${plural(-j.daysLeft, 'working day')} late`, tone: STATUS.overdue }
  if (j.daysLeft === 0) return { text: 'today', tone: STATUS.caution }
  return { text: plural(j.daysLeft, 'working day'), tone: j.daysLeft <= 2 ? STATUS.caution : 'var(--ink-3)' }
}

/** "3 Pakete, 1 E2E, 1 plan" */
function countLine(jobs) {
  const n = k => jobs.filter(j => j.kind === k).length
  return [[n('paket'), 'Paket', 'Pakete'], [n('e2e'), 'E2E', 'E2E'], [n('plan'), 'plan', 'plans']].filter(([c]) => c).map(([c, one, many]) => plural(c, one, many)).join(', ')
}

/** The steps as one slim bar each: done in ink, the current one in the accent, a skipped one dashed. */
function SlimTrack({ steps, index }) {
  const now = steps[index]
  return (
    <span className="block" role="img" aria-label={now ? `Step ${index + 1} of ${steps.length}: ${now.name}` : 'No step yet'}>
      <span className="flex h-1.5 w-full gap-[3px]" aria-hidden="true">
        {steps.map((s, i) => (
          <span key={s.key} className="block h-full min-w-[6px] flex-1 rounded-full"
            style={s.skipped ? { border: '1px dashed var(--line-2)' } : { background: i === index ? 'var(--accent)' : i < index ? 'rgba(var(--ink-rgb),.34)' : 'var(--wash-2)' }} />
        ))}
      </span>
    </span>
  )
}

/** A quiet fact under the sentence: no tint, the title's edge. */
const Chip = ({ children, title }) => (
  <span title={title} className="tag tag-plain rounded-md px-1.5 py-[2px] text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{children}</span>
)

function JobRow({ j }) {
  const c = countdown(j)
  const steps = j.steps || []
  const q = j.questions || {}
  const kit = j.kit
  return (
    <li className="rule">
      <a href={j.href} className="grid grid-cols-1 items-start gap-x-6 gap-y-2 rounded-[10px] px-2 py-3.5 transition-colors hover:bg-[var(--wash)] md:grid-cols-[minmax(220px,1.15fr)_minmax(150px,.7fr)_minmax(260px,1.6fr)]"
        aria-label={`${j.kindLabel} ${j.name}, ${c.text}. ${j.escalating ? 'Escalate. ' : ''}Next: ${j.next}`}>
        <span className="min-w-0">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 rounded-md px-1.5 py-[1px] text-[12px] font-medium" style={{ background: 'var(--wash-2)', color: 'var(--ink-2)' }}>{j.kindLabel}</span>
            <span className="truncate text-[15px] font-medium" title={j.name}>{j.name}</span>
          </span>
          <span className="tnum mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" data-volatile>
            <span style={{ color: c.tone }}>{c.text}</span>
            {j.deadline && <span style={{ color: 'var(--ink-3)' }}>{j.deadlineLabel && j.kind === 'plan' ? `${j.deadlineLabel} ` : ''}{fmtDate(j.deadline)}</span>}
            {j.escalating && <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-[1px] text-[12.5px] font-medium" style={{ color: STATUS.overdue, background: `color-mix(in srgb, ${STATUS.overdue} 14%, transparent)` }} title={(j.escalation || []).map(r => r.text).join('; ')}>
              <WarningCircle size={13} weight="bold" aria-hidden="true" /> Escalate
            </span>}
          </span>
        </span>
        <span className="min-w-0 md:pt-[7px]">
          {steps.length > 0 ? <SlimTrack steps={steps} index={j.index} /> : null}
          <span className="mt-1.5 block truncate text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            {j.stepName ? `${j.stepName}${steps.length ? `, ${j.index + 1} of ${steps.length}` : ''}` : 'no phases yet'}{j.gate?.holds ? ', gate shut' : ''}
          </span>
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] leading-snug" style={{ color: 'var(--ink)' }}>{j.next}</span>
          {(q.open > 0 || kit || j.done?.total > 0) && (
            <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {q.open > 0 && <Chip title={(q.titles || []).join('; ')}>{plural(q.open, 'question')} open{j.owner ? ` with ${first(j.owner)}` : ''}{q.age ? `, ${plural(q.age, 'day')}` : ''}</Chip>}
              {kit && <Chip title={`${kit.kitted} of ${kit.total} items kitted; ${kit.complete} of ${kit.machines} machines complete`}>kit {kit.kitted} of {kit.total}, {kit.complete} of {plural(kit.machines, 'machine')}</Chip>}
              {j.done?.total > 0 && <Chip>{j.kind === 'paket' ? 'result' : 'done'} {j.done.ticked} of {j.done.total}</Chip>}
            </span>
          )}
        </span>
      </a>
    </li>
  )
}

/**
 * "New Paket" lands on Projects with ?new=paket. The plan form lives in Projects.jsx; this opens it by its
 * accessible names (the "New project" button, then the "Paket" radio), so a renamed control only means the
 * link lands on the list.
 */
function useNewPaketLink(on) {
  useEffect(() => {
    if (!on) return
    let timer = null
    const open = () => {
      const [route, query = ''] = location.hash.split('?')
      const p = new URLSearchParams(query)
      if (p.get('new') !== 'paket') return
      p.delete('new')
      history.replaceState(null, '', `${route}${p.toString() ? `?${p}` : ''}`)
      let tries = 0
      clearInterval(timer)
      timer = setInterval(() => {
        tries++
        const form = document.querySelector('form[aria-label="New project"]')
        const radio = form && [...form.querySelectorAll('[role="radio"]')].find(b => b.textContent.trim() === 'Paket')
        if (radio) { radio.click(); radio.focus(); clearInterval(timer); return }
        if (!form) [...document.querySelectorAll('main button')].find(b => b.textContent.trim() === 'New project')?.click()
        if (tries > 40) clearInterval(timer)
      }, 50)
    }
    open()
    addEventListener('hashchange', open)
    return () => { removeEventListener('hashchange', open); clearInterval(timer) }
  }, [on])
}

export default function JobsStrip({ full = false }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const had = useRef(false)
  // a refresh that fails keeps what is on screen; only a first load that fails says so
  const load = useCallback(() => getJobs().then(d => { had.current = true; setData(d); setErr(null) }).catch(e => { if (!had.current) setErr(e.message) }), [])
  useEffect(() => { load(); addEventListener('bench:refresh', load); return () => removeEventListener('bench:refresh', load) }, [load])
  useNewPaketLink(full)

  const wrap = children => full
    ? <section className="panel p-6 sm:p-7" aria-labelledby="jobs-title">{children}</section>
    : <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, ease: EASE }} className="pt-14" aria-labelledby="jobs-title">
        <div className="panel p-6 sm:p-7">{children}</div>
      </motion.section>

  if (err && !data) return <div className={full ? '' : 'pt-14'}><LoadFailed title="The jobs did not load." message={`${err}. Nothing is lost; Try again asks once more.`} onRetry={() => { setErr(null); load() }} /></div>
  if (!data) return wrap(<div aria-hidden="true"><Bar w="18%" h={22} /><Bar w="40%" h={12} className="mt-3" /><div className="mt-6 flex flex-col gap-4">{[0, 1, 2].map(i => <Bar key={i} w={`${70 + i * 8}%`} h={14} />)}</div></div>)

  const jobs = data.jobs || []
  const shown = full ? jobs : jobs.slice(0, MAX_HOME)
  const escalate = jobs.filter(j => j.escalating).length
  const dueToday = jobs.filter(j => j.daysLeft === 0)
  const questions = jobs.reduce((n, j) => n + (j.questions?.open || 0), 0)
  const owners = [...new Set(jobs.filter(j => j.questions?.open).map(j => first(j.owner)).filter(Boolean))]
  return wrap(<>
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <h2 id="jobs-title" className="display text-[22px] font-semibold leading-none">Jobs.</h2>
      {jobs.length > 0 && <span className="tnum flex flex-wrap gap-x-3 text-[13.5px]" data-volatile>
        <span style={{ color: 'var(--ink-2)' }}>{countLine(jobs)}</span>
        {dueToday.length > 0 && <span style={{ color: STATUS.caution }}>{dueToday.length === 1 ? `${dueToday[0].name} due today` : `${dueToday.length} due today`}</span>}
        {questions > 0 && <span style={{ color: 'var(--ink-3)' }}>{plural(questions, 'question')} open{owners.length === 1 ? ` with ${owners[0]}` : ''}</span>}
        {escalate > 0 && <span style={{ color: STATUS.overdue }}>{escalate} to escalate</span>}
      </span>}
    </div>
    {jobs.length === 0 ? (
      <p className="mt-3 max-w-[65ch] text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
        No Paket or E2E is open. When Roman hands one over, write down its result and date first.{' '}
        <a href="#/projects?new=paket" className="-my-[3px] inline-block py-[3px] font-medium underline underline-offset-2" style={{ color: 'var(--ink)' }}>New Paket</a>
      </p>
    ) : (
      <ul className="mt-4 flex flex-col">
        {shown.map(j => <JobRow key={j.id} j={j} />)}
      </ul>
    )}
    {!full && jobs.length > MAX_HOME && (
      <div className="rule pt-3">
        <a href="#/projects" className="-my-[3px] inline-flex items-center gap-1.5 py-[3px] text-[13.5px] font-medium underline-offset-2 hover:underline" style={{ color: 'var(--ink-2)' }}>All jobs <ArrowRight size={13} weight="bold" /></a>
      </div>
    )}
  </>)
}
