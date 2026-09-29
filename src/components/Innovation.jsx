import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, FolderOpen } from '@phosphor-icons/react'
import { getPortfolio, getInnovation } from '../api/portfolio.js'
import { createProject } from '../api/projects.js'
import { openLink } from '../api.js'
import { PanelSkeleton } from './Skeleton.jsx'
import LoadFailed from './LoadFailed.jsx'
import { STATUS } from '../scenes.js'

/**
 * Innovation projects (roadmap 143). Every Planner card whose title carries an I-code is a project here; its
 * bucket is the stage in the Phase Gate plan (Concept, Development, Procurement, Testing, Production), its
 * due date the project's. The page gathers what carries the code: your tasks, Logbook entries and their open
 * actions, Napkin maps, and the synced Teams folder. Planner stays the source: nothing here moves the card.
 * #/projects?i=I-1050 opens one.
 */
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const btn = 'pill inline-flex min-h-[32px] items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-50'
const quiet = btn + ' btn-quiet', primary = btn + ' btn-primary'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmt = iso => { if (!iso) return ''; const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`); return `${d.getDate()} ${MONTHS[d.getMonth()]}` }
const toast = (text, by) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true } }))
export const codeFromHash = () => new URLSearchParams(location.hash.split('?')[1] || '').get('i')
const LANE = { today: 'Today', active: 'Active', waiting: 'Waiting', innovation: 'Innovation', parked: 'Parked' }

/** The five stages as one track: done stages ink, the current one the accent, those ahead a wash. */
export function StageTrack({ stages, stage, big = false }) {
  const label = stage >= 0 ? `Stage ${stage + 1} of ${stages.length}: ${stages[stage].name}` : 'Stage not known: the card sits in another bucket'
  return (
    <div role="img" aria-label={label} className={big ? 'mt-1' : ''}>
      <div className={`flex w-full gap-1 ${big ? 'h-2' : 'h-1.5'}`}>
        {stages.map((s, i) => (
          <span key={s.key} title={`${s.name} (${s.de})`} className="block h-full flex-1 rounded-full"
            style={{ background: i === stage ? 'var(--accent)' : i < stage ? 'rgba(var(--ink-rgb),.34)' : 'var(--wash-2)' }} />
        ))}
      </div>
      {big && (
        <div className="mt-2 flex w-full gap-1 text-[12.5px]" aria-hidden="true">
          {stages.map((s, i) => <span key={s.key} className="flex-1 truncate" style={{ color: i === stage ? 'var(--ink)' : 'var(--ink-3)', fontWeight: i === stage ? 500 : 400 }}>{s.name}</span>)}
        </div>
      )}
    </div>
  )
}

const dueLine = p => p.done ? 'done in Planner' : p.due ? (p.overdue ? `due ${fmt(p.due)}, ${p.overdue} days over` : `due ${fmt(p.due)}`) : 'no due date'

// ── the list, above the plans on #/projects ───────────────────────────
export function InnovationList() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const load = useCallback(() => getPortfolio().then(d => { setData(d); setErr(null) }).catch(e => setErr(e.message)), [])
  useEffect(() => { load(); addEventListener('bench:refresh', load); return () => removeEventListener('bench:refresh', load) }, [load])
  if (err && !data) return <LoadFailed title="The innovation projects did not load." message={`${err}. Try again asks once more.`} onRetry={load} />
  if (!data) return <PanelSkeleton />
  const { stages, projects } = data
  return (
    <section className="panel p-6 sm:p-7" aria-label="Innovation projects">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="display text-[22px] font-semibold leading-none">Innovation.</h2>
        <span className="tnum text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{projects.length ? `${plural(projects.filter(p => !p.done).length, 'project')} under way, from Planner` : 'from Planner'}</span>
      </div>
      {!projects.length ? (
        <p className="mt-3 max-w-[65ch] text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>No innovation project yet. A Planner card whose title starts with an I-code, like "I-1050 Handgrip strength", shows up here by itself once Planner is connected.</p>
      ) : (
        <ul className="mt-4 flex flex-col">
          {projects.map(p => (
            <li key={p.code} className="rule">
              <a href={`#/projects?i=${encodeURIComponent(p.code)}`} className="grid grid-cols-1 items-center gap-x-6 gap-y-2 rounded-[10px] px-2 py-3 transition-colors hover:bg-[var(--wash)] sm:grid-cols-[minmax(220px,1.3fr)_minmax(180px,1fr)_15rem]">
                <span className="min-w-0">
                  <span className="tnum text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>{p.code}</span>
                  <span className="ml-2 text-[14.5px]" style={{ color: p.done ? 'var(--ink-3)' : 'var(--ink)' }}>{p.name}</span>
                </span>
                <span className="min-w-0">
                  <StageTrack stages={stages} stage={p.stage} />
                  <span className="mt-1 block text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{p.stageName || p.bucket || 'no stage'}</span>
                </span>
                <span className="tnum flex flex-wrap items-baseline justify-end gap-x-3 text-[13px]" data-volatile>
                  <span style={{ color: p.overdue ? STATUS.overdue : 'var(--ink-3)' }}>{dueLine(p)}</span>
                  {(p.open > 0 || p.openActions > 0) && <span style={{ color: 'var(--ink-3)' }}>{[p.open ? plural(p.open, 'task') : null, p.openActions ? plural(p.openActions, 'action') : null].filter(Boolean).join(', ')}</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ── one project ───────────────────────────────────────────────────────
const Figure = ({ value, label, tone }) => (
  <div>
    <div className="display tnum text-[26px] font-semibold leading-none sm:text-[30px]" style={{ color: tone || 'var(--ink)' }}>{value}</div>
    <div className="mt-1.5 text-[13px]" style={{ color: 'var(--ink-3)' }}>{label}</div>
  </div>
)

export function InnovationDetail({ code, onBack }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => getInnovation(code).then(x => { setD(x); setErr(null) }).catch(e => setErr(e.message)), [code])
  useEffect(() => { load(); addEventListener('bench:refresh', load); return () => removeEventListener('bench:refresh', load) }, [load])
  if (err && !d) return <main className="mx-auto col px-6">{err === 'not found'
    ? <p className="text-[14px]" style={{ color: 'var(--ink-3)' }}>No Planner card carries {code} any more. <button onClick={onBack} className="-my-[3px] inline-block py-[3px] underline underline-offset-2">Back to the list</button></p>
    : <LoadFailed title="The project did not load." message={`${err}. Try again asks once more.`} onRetry={load} />}</main>
  if (!d) return <main className="mx-auto col px-6"><PanelSkeleton /></main>
  const { project: p, stages, tasks, entries, actions, maps, plan } = d
  const open = tasks.filter(t => !t.done)
  const openFolder = async () => { const r = await openLink(p.folder); if (typeof r === 'string' && r) toast('The folder did not open.', r) }
  const planIt = async () => {
    setBusy(true)
    try { const pl = await createProject({ name: p.title, machine: p.title }); location.hash = `#/projects?p=${encodeURIComponent(pl.id)}` }
    catch (e) { toast('That did not work.', e.message) } finally { setBusy(false) }
  }
  return (
    <main className="mx-auto col flex flex-col gap-4 px-6">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className={btn + ' btn-ghost'}><ArrowLeft size={13} weight="bold" /> All projects</button>
      </div>

      <section className="panel p-6 sm:p-7" aria-label="Project">
        <p className="tnum text-[13.5px] font-medium" style={{ color: 'var(--ink-3)' }}>{p.code}{p.plan ? `, ${p.plan} in Planner` : ''}</p>
        <h1 className="display mt-1 text-[32px] font-semibold leading-none sm:text-[40px]">{p.name}.</h1>
        <div className="mt-5"><StageTrack stages={stages} stage={p.stage} big /></div>
        {p.stage < 0 && <p className="mt-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>The card sits in "{p.bucket || 'no bucket'}", which is not one of the five stages.</p>}
        <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4" data-volatile>
          <Figure value={p.due ? fmt(p.due) : 'none'} label={p.done ? 'done in Planner' : p.overdue ? `due, ${p.overdue} days over` : p.due ? 'due in Planner' : 'no due date in Planner'} tone={p.overdue ? STATUS.overdue : 'var(--accent)'} />
          <Figure value={p.stageName || '?'} label={p.stage >= 0 ? `stage ${p.stage + 1} of ${stages.length}` : 'stage not known'} />
          <Figure value={open.length} label={open.length === 1 ? 'open task of yours' : 'open tasks of yours'} />
          <Figure value={actions.length} label={actions.length === 1 ? 'open Logbook action' : 'open Logbook actions'} tone={actions.length ? STATUS.caution : undefined} />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {p.folder && <button onClick={openFolder} className={quiet} title={p.folder}><FolderOpen size={13} weight="bold" /> Open the Teams folder</button>}
          {plan
            ? <a href={`#/projects?p=${encodeURIComponent(plan.id)}`} className={quiet}>Open the plan{plan.deadline ? `, ${plan.deadlineLabel} ${fmt(plan.deadline)}` : ''}</a>
            : <button onClick={planIt} disabled={busy} aria-busy={busy} className={primary} title="A plan back from a deadline, with the five stages as its phases">Plan it back from a date</button>}
        </div>
        <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>The stage and the due date come from the card in Planner; move the card there and Bench. follows at the next sync. Anything that names {p.code} joins this page: a task's title or project, a Logbook entry, a Napkin map.</p>
      </section>

      <section className="panel p-6 sm:p-7" aria-label="Your tasks">
        <h2 className="display text-[22px] font-semibold leading-none">Your tasks.</h2>
        {tasks.length ? (
          <ul className="mt-4 flex flex-col">
            {tasks.map(t => (
              <li key={t.id} className="rule flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
                <span className="min-w-[200px] flex-1 text-[14px]" style={{ color: t.done ? 'var(--ink-3)' : 'var(--ink)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</span>
                <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }} data-volatile>{[t.done ? 'done' : LANE[t.lane] || t.lane, t.due ? `due ${fmt(t.due)}` : null].filter(Boolean).join(', ')}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>None yet. Put {p.code} in a task's Project field, or in its title, and it joins here.</p>}
      </section>

      <section className="panel p-6 sm:p-7" aria-label="Logbook">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="display text-[22px] font-semibold leading-none">Logbook.</h2>
          <a href="#/logbook" className="-my-1 inline-block py-1 text-[13px] underline underline-offset-2" style={{ color: 'var(--ink-3)' }}>Open the Logbook</a>
        </div>
        {actions.length > 0 && (
          <ul className="mt-4 flex flex-col">
            {actions.map(a => (
              <li key={a.id} className="rule flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
                <span className="min-w-[200px] flex-1 text-[14px]">{a.text}</span>
                <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }} data-volatile>{[a.entryTitle, a.owner, a.due ? `due ${fmt(a.due)}` : null].filter(Boolean).join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
        {entries.length ? (
          <ul className="mt-4 flex flex-col">
            {entries.map(e => (
              <li key={e.id} className="rule py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="text-[14px]">{e.title}</span>
                  <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{fmt(e.date)}{e.openActions ? `, ${plural(e.openActions, 'open action')}` : ''}</span>
                </div>
                {e.decisions.length > 0 && <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>Decided: {e.decisions.join('; ')}</p>}
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>No entry names {p.code} yet. Put it in an entry's Project field and the meeting shows here.</p>}
      </section>

      {maps.length > 0 && (
        <section className="panel p-6 sm:p-7" aria-label="Napkin maps">
          <h2 className="display text-[22px] font-semibold leading-none">Napkin.</h2>
          <ul className="mt-4 flex flex-col">{maps.map(m => <li key={m.id} className="rule py-2 text-[14px]"><a href="#/napkin" className="underline-offset-2 hover:underline">{m.title}</a></li>)}</ul>
        </section>
      )}
    </main>
  )
}
