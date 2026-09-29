import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Hash, Wrench, FolderSimple, User, NotePencil } from '@phosphor-icons/react'
import { getNextPrep, prepHref, logMeeting, whenText, headline, reasonText, ownerText } from '../api/meetprep.js'
import { toast } from '../api/extras.js'
import { fmtDate } from '../lanes.js'

/**
 * The next meeting on Home (roadmap 163). Shows only when a meeting starts within 30 minutes (or runs now)
 * and the board or the Logbook has something on it, or when one ended today and has no entry yet: then it
 * offers Log this meeting. The subject, when, the topics as chips, then up to three lines each of Open,
 * Owed and Waiting on. Asks the server once a minute; says nothing when there is nothing.
 */
const EASE = [0.16, 1, 0.3, 1]
const ICON = { code: Hash, machine: Wrench, project: FolderSimple, person: User }

/** The topics of a meeting as plain chips, each with the small icon of its kind. */
export function TopicChips({ topics = [], className = '' }) {
  if (!topics.length) return null
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-1.5 ${className}`} aria-label="Topics">
      {topics.map(t => {
        const Icon = ICON[t.kind] || Hash
        return (
          <li key={t.kind + t.key} title={t.name ? `${t.label} ${t.name}` : t.label} className="tag inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: 'var(--ink-2)' }}>
            <Icon size={13} weight="bold" aria-hidden="true" style={{ color: 'var(--ink-3)' }} />
            <span>{t.label}{t.name ? <span style={{ color: 'var(--ink-3)' }}>{` ${t.name}`}</span> : null}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** One short column: a label with its count, then at most three lines, each a title and why it is here. */
function Column({ title, count, items }) {
  if (!items.length) return null
  return (
    <div className="min-w-0">
      <h3 className="text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>{title} <span className="tnum">{count}</span></h3>
      <ul className="mt-2">
        {items.slice(0, 3).map(it => (
          <li key={it.key} className="rule flex items-baseline gap-3 py-2 text-[13.5px]">
            <a href={it.href} className="min-w-0 flex-1 truncate underline-offset-2 hover:underline" title={it.title}>{it.title}</a>
            <span className="shrink-0 text-[12.5px]" style={{ color: it.late ? 'var(--late)' : 'var(--ink-3)' }}>{it.meta}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function MeetPrepCard() {
  const [n, setN] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let on = true
    const load = () => getNextPrep().then(x => on && setN(x)).catch(() => {})
    load()
    const id = setInterval(load, 60_000)
    addEventListener('bench:refresh', load)
    return () => { on = false; clearInterval(id); removeEventListener('bench:refresh', load) }
  }, [])
  if (!n?.meeting) return null
  const { meeting: m, phase, minutes, prep } = n
  const ended = phase === 'ended'
  const log = async () => {
    setBusy(true)
    try { await logMeeting(prep) } catch (e) { toast('The entry did not start.', `${e.message}. Try again.`) } finally { setBusy(false) }
  }
  // one fact per line: late first, then who it is with, then the due date
  const due = d => d ? `due ${fmtDate(d)}` : null
  const open = prep.open.map(t => ({ key: t.id, href: `#/board?task=${t.id}`, title: t.title, meta: t.late ? due(t.dueDate) : reasonText(t.reason, prep.topics) || due(t.dueDate), late: t.late }))
  const owed = prep.owed.map(a => ({ key: a.id, href: `#/logbook?entry=${a.entryId}`, title: a.text, meta: a.late ? due(a.due) : ownerText(a) || due(a.due), late: a.late }))
  const waiting = prep.waiting.map(t => ({ key: t.id, href: `#/board?task=${t.id}`, title: t.title, meta: t.waitingOn }))
  const cols = [open, owed, waiting].filter(c => c.length).length
  const grid = cols === 3 ? 'md:grid-cols-3' : cols === 2 ? 'md:grid-cols-2' : ''

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, ease: EASE }} className="pt-14" aria-labelledby="meetprep-title">
      <div className="panel p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <p className="text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>{ended ? 'Just held' : 'Next meeting'}</p>
            <h2 id="meetprep-title" className="display mt-1.5 text-[26px] font-semibold leading-tight">{headline(m.subject)}</h2>
            <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
              <span className="font-medium" style={{ color: 'var(--ink-2)' }}>{whenText(phase, minutes, m)}</span>
              {m.start && <span className="tnum" style={{ color: 'var(--ink-3)' }}>{m.end ? `${m.start} to ${m.end}` : m.start}</span>}
              {m.location && <span style={{ color: 'var(--ink-3)' }}>{m.location}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ended && (
              <button onClick={log} disabled={busy} className="pill btn-primary inline-flex min-h-[36px] items-center gap-2 px-4 py-2 text-[13.5px] font-medium">
                <NotePencil size={14} weight="bold" aria-hidden="true" />{prep.logged ? 'Open the entry' : 'Log this meeting'}
              </button>
            )}
            <a href={prepHref(m.id)} className={`pill ${ended ? 'btn-ghost' : 'btn-quiet'} inline-flex min-h-[36px] items-center gap-2 px-4 py-2 text-[13.5px] font-medium`}>
              {ended ? 'The prep' : 'Full prep'} <ArrowRight size={13} weight="bold" aria-hidden="true" />
            </a>
          </div>
        </div>
        <TopicChips topics={prep.topics} className="mt-4" />
        {!ended && cols > 0 && (
          <div className={`mt-5 grid gap-x-8 gap-y-5 ${grid}`}>
            <Column title="Open" count={prep.openCount} items={open} />
            <Column title="Owed" count={prep.owedCount} items={owed} />
            <Column title="Waiting on" count={prep.waitingCount} items={waiting} />
          </div>
        )}
        {!ended && !cols && prep.last && (
          <p className="mt-4 text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
            <a href={`#/logbook?entry=${prep.last.id}`} className="underline-offset-2 hover:underline">Last time, {fmtDate(prep.last.date)}</a>
            {prep.last.decisions[0] ? <span style={{ color: 'var(--ink-3)' }}>{`: ${prep.last.decisions[0]}`}</span> : null}
          </p>
        )}
      </div>
    </motion.section>
  )
}
