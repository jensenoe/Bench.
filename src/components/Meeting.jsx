import { useEffect, useState } from 'react'
import { ArrowSquareOut, NotePencil } from '@phosphor-icons/react'
import { getPrep, logMeeting, whenText, headline, reasonText, ownerText, sameSeries } from '../api/meetprep.js'
import { openExternal } from '../api.js'
import { toast } from '../api/extras.js'
import { fmtDate } from '../lanes.js'
import { PanelSkeleton } from './Skeleton.jsx'
import LoadFailed from './LoadFailed.jsx'
import { TopicChips } from './MeetPrepCard.jsx'

/**
 * The prep page at #/meeting?id=... (roadmap 163): one of today's meetings with everything Bench. found
 * for it. What it is about (codes, machines, plans, people), the open tasks, the Logbook actions owed,
 * what waits on the people in it, and the last time with its decisions. Join in Teams when it is an online
 * meeting; Log this meeting once it has ended, which starts the Logbook entry from the calendar and the prep.
 * Asks again once a minute, so "in 12 minutes" turns into "ended at" on its own.
 */
const idOf = () => new URLSearchParams(location.hash.split('?')[1] || '').get('id') || ''

/** A panel of ledger lines; left out when it has nothing. */
function Section({ title, count, children, more }) {
  return (
    <section className="panel p-6 sm:p-7">
      <h3 className="display text-[22px] font-semibold leading-none">{title}{count ? <span className="tnum ml-2 text-[15px] font-normal" style={{ color: 'var(--ink-3)' }}>{count}</span> : null}</h3>
      <ul className="mt-4">{children}</ul>
      {more ? <p className="mt-3 text-[13px]" style={{ color: 'var(--ink-3)' }}>{more}</p> : null}
    </section>
  )
}
function Line({ href, title, meta, late = false, sub = null }) {
  return (
    <li className="rule flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-2.5">
      <a href={href} className="min-w-[200px] flex-1 py-[2px] text-[14px] underline-offset-2 hover:underline">{title}</a>
      {sub && <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{sub}</span>}
      {meta && <span className="tnum text-[13px]" style={{ color: late ? 'var(--late)' : 'var(--ink-3)' }}>{meta}</span>}
    </li>
  )
}
const moreOf = (shown, count, where) => count > shown ? `${count - shown} more ${where}.` : null

export default function Meeting() {
  const [id, setId] = useState(idOf)
  const [n, setN] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const on = () => setId(idOf())
    addEventListener('hashchange', on); return () => removeEventListener('hashchange', on)
  }, [])
  const load = (quiet = false) => {
    if (!id) return
    if (!quiet) setErr(null)
    return getPrep(id).then(x => { setN(x); setErr(null) }).catch(e => { if (!quiet) setErr(e.message) })
  }
  useEffect(() => {
    setN(null); load()
    const t = setInterval(() => load(true), 60_000)
    return () => clearInterval(t)
  }, [id])   // eslint-disable-line react-hooks/exhaustive-deps

  if (!id || /not on today/i.test(err || '')) return (
    <main className="mx-auto col px-6">
      <section className="panel max-w-[640px] p-6 sm:p-7">
        <h2 className="display text-[26px] font-semibold leading-none">Not on today's calendar.</h2>
        <p className="mt-3 text-[14px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>Bench. reads today's meetings only, so a prep from another day, or a meeting moved or cancelled, has nothing to show. Home shows the next meeting when it is close.</p>
        <a href="#/" className="pill btn-quiet mt-5 inline-flex items-center px-4 py-2 text-[13.5px] font-medium">Home</a>
      </section>
    </main>
  )
  if (err) return <main className="mx-auto col px-6"><LoadFailed title="The prep did not load." message={`${err}. Nothing was changed; Try again asks once more.`} onRetry={() => load()} /></main>
  if (!n) return <main className="mx-auto col px-6"><div className="grid gap-4 lg:grid-cols-2"><PanelSkeleton rows={3} /><PanelSkeleton rows={3} /></div></main>

  const { meeting: m, phase, minutes, prep } = n
  const ended = phase === 'ended'
  // the people the board knows are chips already; the line names the rest
  const chipped = new Set(prep.topics.filter(t => t.kind === 'person').map(t => t.label))
  const others = prep.people.filter(p => !chipped.has(p))
  const log = async () => {
    setBusy(true)
    try { await logMeeting(prep) } catch (e) { toast('The entry did not start.', `${e.message}. Try again.`) } finally { setBusy(false) }
  }

  return (
    <main className="mx-auto col flex flex-col gap-4 px-6">
      <section className="panel p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div className="min-w-0 max-w-[65ch]">
            <h2 className="display text-[32px] font-semibold leading-tight">{headline(m.subject)}</h2>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[14.5px]">
              <span className="font-medium" style={{ color: 'var(--ink-2)' }}>{whenText(phase, minutes, m)}</span>
              {m.start && <span className="tnum" style={{ color: 'var(--ink-3)' }}>{m.end ? `${m.start} to ${m.end}` : m.start}</span>}
              {m.location && <span style={{ color: 'var(--ink-3)' }}>{m.location}</span>}
              {m.organizer && <span style={{ color: 'var(--ink-3)' }}>organised by {m.organizer}</span>}
            </p>
            {others.length > 0 && <p className="mt-3 text-[14px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{chipped.size ? 'Also with' : 'With'} {others.join(', ')}.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {m.joinUrl && !ended && (
              <button onClick={() => openExternal(m.joinUrl)} className="pill btn-primary inline-flex min-h-[36px] items-center gap-2 px-4 py-2 text-[13.5px] font-medium">
                Join in Teams <ArrowSquareOut size={13} weight="bold" aria-hidden="true" />
              </button>
            )}
            {ended && (
              <button onClick={log} disabled={busy} className="pill btn-primary inline-flex min-h-[36px] items-center gap-2 px-4 py-2 text-[13.5px] font-medium">
                <NotePencil size={14} weight="bold" aria-hidden="true" />{prep.logged ? 'Open the entry' : 'Log this meeting'}
              </button>
            )}
          </div>
        </div>
        <TopicChips topics={prep.topics} className="mt-5" />
        {ended && !prep.logged && <p className="mt-5 max-w-[65ch] text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>Log this meeting starts a Logbook entry with the title, today's date, {prep.draft.project ? `${prep.draft.project} as the project, ` : ''}the people and what was open going in. Nothing else changes.</p>}
      </section>

      {prep.empty ? (
        <section className="panel p-6 sm:p-7">
          <h3 className="display text-[22px] font-semibold leading-none">Nothing to bring.</h3>
          <p className="mt-3 max-w-[65ch] text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>No project code, machine, plan or person from the board is in this meeting. An I-code or a machine name in the subject brings its tasks here.</p>
        </section>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {prep.open.length > 0 && (
            <Section title="Open." count={prep.openCount} more={moreOf(prep.open.length, prep.openCount, 'on the board')}>
              {prep.open.map(t => <Line key={t.id} href={`#/board?task=${t.id}`} title={t.title} sub={reasonText(t.reason, prep.topics)} meta={t.dueDate ? `due ${fmtDate(t.dueDate)}` : null} late={t.late} />)}
            </Section>
          )}
          {prep.owed.length > 0 && (
            <Section title="Owed." count={prep.owedCount} more={moreOf(prep.owed.length, prep.owedCount, 'in the Logbook')}>
              {prep.owed.map(a => <Line key={a.id} href={`#/logbook?entry=${a.entryId}`} title={a.text} sub={[ownerText(a), sameSeries(a.entryTitle, m.subject) ? null : a.entryTitle].filter(Boolean).join(', ')} meta={a.due ? `due ${fmtDate(a.due)}` : null} late={a.late} />)}
            </Section>
          )}
          {prep.waiting.length > 0 && (
            <Section title="Waiting on." count={prep.waitingCount} more={moreOf(prep.waiting.length, prep.waitingCount, 'waiting')}>
              {prep.waiting.map(t => <Line key={t.id} href={`#/board?task=${t.id}`} title={t.title} sub={t.waitingOn} meta={t.since ? `since ${fmtDate(t.since)}` : null} />)}
            </Section>
          )}
          {prep.last && (
            <Section title="Last time.">
              <Line href={`#/logbook?entry=${prep.last.id}`} title={prep.last.title} sub={prep.last.reason === 'same meeting' ? 'the same meeting' : prep.last.reason} meta={fmtDate(prep.last.date)} />
              {prep.last.decisions.length > 0 && <li className="pb-1 pt-4 text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>Decided</li>}
              {prep.last.decisions.length > 0
                ? prep.last.decisions.map((d, i) => <li key={i} className="rule py-2.5 text-[14px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{d}</li>)
                : <li className="rule py-2.5 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>No decisions written down that time.</li>}
            </Section>
          )}
        </div>
      )}
    </main>
  )
}
