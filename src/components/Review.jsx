import { useEffect, useState } from 'react'
import { CaretLeft, CaretRight, Copy, EnvelopeSimple, DownloadSimple } from '@phosphor-icons/react'
import * as day from '../api/day.js'
import { openExternal } from '../api.js'
import { shortDate, fmtDate } from '../lanes.js'
import { PanelSkeleton } from './Skeleton.jsx'

/**
 * The weekly review (roadmap 83): one week, Monday to Sunday, as panels. What got done, what slipped,
 * the hours (clocked per day and by project), what moved in Innovation, what was ordered, what was
 * written. The bottom row copies the plain-text summary or opens it as a draft mail.
 */
const hm = ms => { const m = Math.round((ms || 0) / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` }
const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const mondayOf = (d = new Date()) => { const m = new Date(d); m.setHours(12, 0, 0, 0); m.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return key(m) }
const shift = (start, weeks) => { const d = new Date(start + 'T12:00:00'); d.setDate(d.getDate() + weeks * 7); return key(d) }
const sundayOf = start => { const d = new Date(start + 'T12:00:00'); d.setDate(d.getDate() + 6); return d }
const toast = (text, by) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true } }))

export default function Review() {
  const [start, setStart] = useState(() => mondayOf())
  const [r, setR] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    let on = true
    setErr(null)
    day.getReview(start).then(x => on && setR(x)).catch(e => on && setErr(e.message))
    return () => { on = false }
  }, [start])
  const thisWeek = start >= mondayOf()
  const title = r ? `Week ${r.week}.` : 'Week.'
  const range = `${shortDate(new Date(start + 'T12:00:00'), { weekday: false })} to ${shortDate(sundayOf(start), { weekday: false })}`

  const copy = async () => {
    if (!r) return
    try { await navigator.clipboard.writeText(r.text); toast('Copied.', 'The week as text, ready to paste.') }
    catch { toast('Could not copy.', 'The clipboard is not available here.') }
  }
  const mail = () => {
    if (!r) return
    const subject = `Week ${r.week}${r.firstName ? `, ${r.firstName}` : ''}`
    openExternal(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(r.text)}`)
  }
  const worked = r ? r.clocked.reduce((s, d) => s + (d.worked || 0), 0) : 0

  return (
    <main className="mx-auto col px-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button onClick={() => setStart(s => shift(s, -1))} aria-label="Previous week" className="grid h-8 w-8 place-items-center rounded-full" style={{ border: '1px solid var(--line-2)' }}><CaretLeft size={13} weight="bold" /></button>
        <h2 className="display min-w-[120px] text-center text-[24px] font-semibold leading-none">{title}</h2>
        <button onClick={() => setStart(s => shift(s, 1))} disabled={thisWeek} aria-label="Next week" className="grid h-8 w-8 place-items-center rounded-full disabled:opacity-30" style={{ border: '1px solid var(--line-2)' }}><CaretRight size={13} weight="bold" /></button>
        <span className="tnum text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{range}</span>
        {!thisWeek && <button onClick={() => setStart(mondayOf())} className="text-[13px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}>This week</button>}
      </div>

      {err && <p role="alert" className="mb-4 text-[13.5px]" style={{ color: 'var(--late)' }}>{err}</p>}
      {!r && !err && <div className="grid gap-4 lg:grid-cols-2"><PanelSkeleton rows={4} /><PanelSkeleton rows={4} /></div>}

      {r && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Done" n={r.done.length} empty="Nothing ticked this week.">
            {r.done.map(t => <Row key={t.id} title={t.title} meta={t.project} lead={shortDate(new Date(t.completedAt)).slice(0, 3)} />)}
          </Panel>
          <Panel title="Slipped" n={r.slipped.length} empty="Nothing slipped. Every due date in the week was met or moved.">
            {r.slipped.map(t => <Row key={t.id} title={t.title} meta={`due ${fmtDate(t.dueDate)}`} tone="var(--late)" />)}
          </Panel>
          <Panel title="Hours" n={worked ? hm(worked) : null} empty={worked || r.hoursByProject.length ? null : 'Nothing on the clock and no sized tasks ticked.'}>
            {r.clocked.filter(d => d.worked > 0).map(d => <Row key={d.date} title={fmtDate(d.date)} meta={hm(d.worked)} />)}
            {r.hoursByProject.length > 0 && (
              <li className="mt-3">
                <h4 className="text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>By project, from the sizes of what was ticked</h4>
                <ul className="mt-1.5 flex flex-col gap-1.5">{r.hoursByProject.map(p => <Row key={p.project} title={p.project} meta={`${p.hours} h`} />)}</ul>
              </li>
            )}
          </Panel>
          <Panel title="Innovation" n={r.innovation.length} empty="Innovation did not move this week.">
            {r.innovation.map(t => <Row key={t.id} title={t.title} meta={t.done ? 'done' : `touched ${fmtDate(t.lastTouched)}`} tone={t.done ? 'var(--ok)' : null} />)}
          </Panel>
          <Panel title="Orders" n={r.orders.length} empty="Nothing was ordered this week.">
            {r.orders.map(t => <Row key={t.id} title={t.title} meta={[t.supplier, t.poNumber].filter(Boolean).join(', ') || fmtDate(t.orderedOn)} lead={shortDate(new Date(t.orderedOn + 'T12:00:00')).slice(0, 3)} />)}
          </Panel>
          <Panel title="Logbook" n={r.logbook.length} empty="Nothing written this week.">
            {r.logbook.map(e => <li key={e.id} className="row flex items-baseline gap-3 px-3.5 py-2.5 text-[13.5px]">
              <span className="tnum shrink-0" style={{ color: 'var(--ink-3)' }}>{shortDate(new Date(e.date + 'T12:00:00')).slice(0, 3)}</span>
              <a href={`#/logbook?entry=${e.id}`} className="-my-[2px] min-w-0 flex-1 truncate py-[2px] underline-offset-2 hover:underline" title={e.title}>{e.title}</a>
            </li>)}
          </Panel>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={copy} disabled={!r} className="pill flex items-center gap-1.5 px-4 py-2 text-[13.5px] font-medium disabled:opacity-50" style={{ border: '1px solid var(--line-2)' }}><Copy size={13} weight="bold" /> Copy as text</button>
        <button onClick={mail} disabled={!r} className="pill flex items-center gap-1.5 px-4 py-2 text-[13.5px] font-medium disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}><EnvelopeSimple size={13} weight="bold" /> Draft a mail</button>
        <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>The mail opens in your mail app with the week as short sentences.</span>
      </div>

      <Cost />
    </main>
  )
}

// ── cost per machine (roadmap 115) ────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = ym => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`
const h = n => n ? n.toLocaleString('de-CH', { maximumFractionDigits: 1 }) : ''
const chf = n => n === null || n === undefined ? '' : n.toLocaleString('de-CH', { maximumFractionDigits: 0 })

/** Hours per machine per month from the sizes of ticked tasks, a cost column when Settings has a rate, and the CSV. */
function Cost() {
  const [months, setMonths] = useState(3)
  const [c, setC] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    let on = true
    const load = () => day.getCost(months).then(x => { if (on) { setC(x); setErr(null) } }).catch(e => on && setErr(e.message))
    load()
    addEventListener('bench:refresh', load)
    return () => { on = false; removeEventListener('bench:refresh', load) }
  }, [months])
  const withCost = c && c.hourlyRate > 0
  const cellCls = 'tnum px-3 py-2 text-right text-[13.5px]'
  const headCls = 'px-3 py-2 text-right text-[13px] font-medium'
  return (
    <section className="panel mt-4 p-6 sm:p-7" aria-label="Cost">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h3 className="display text-[22px] font-semibold leading-none">Cost.</h3>
        <span className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>
          {[3, 6, 12].map(n => <button key={n} onClick={() => setMonths(n)} aria-pressed={months === n} className="pill min-h-6 px-2.5 py-0.5 text-[13px]" style={months === n ? { background: 'var(--row)', border: '1px solid var(--line-2)', color: 'var(--ink)' } : { border: '1px solid transparent' }}>{n} months</button>)}
        </span>
      </header>
      <p className="mt-1.5 max-w-[65ch] text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
        Hours are the sizes of the tasks ticked in each month, by machine. Focus time already sits in the size, so nothing is counted twice.
        {withCost ? ` Cost at ${c.hourlyRate.toLocaleString('de-CH')} CHF an hour, the rate in Settings.` : ' Set an hourly rate in Settings > Hours and a cost column appears.'}
      </p>
      {err && <p role="alert" className="mt-3 text-[13.5px]" style={{ color: 'var(--late)' }}>{err}</p>}
      {c && c.byMachine.length === 0 && <p className="mt-3 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>No sized tasks were ticked in these months. Give a task a size before you tick it and it counts here.</p>}
      {c && c.byMachine.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr style={{ color: 'var(--ink-3)', borderBottom: '1px solid var(--line-2)' }}>
                <th className="px-3 py-2 text-[13px] font-medium">Machine</th>
                {c.months.map(m => <th key={m} className={headCls}>{monthLabel(m)}</th>)}
                <th className={headCls}>Hours</th>
                {withCost && <th className={headCls}>CHF</th>}
              </tr>
            </thead>
            <tbody>
              {c.byMachine.map(r => (
                <tr key={r.project} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td className="px-3 py-2 text-[14px]">{r.project}</td>
                  {c.months.map(m => <td key={m} className={cellCls} style={{ color: r.hours[m] ? 'var(--ink)' : 'var(--ink-3)' }}>{h(r.hours[m]) || '·'}</td>)}
                  <td className={`${cellCls} font-semibold`}>{h(r.total)}</td>
                  {withCost && <td className={`${cellCls} font-semibold`}>{chf(r.cost)}</td>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ color: 'var(--ink-2)' }}>
                <td className="px-3 py-2 text-[13.5px] font-medium">Total</td>
                {c.months.map(m => <td key={m} className={cellCls}>{h(c.byMonth[m]) || '·'}</td>)}
                <td className={`${cellCls} font-semibold`}>{h(c.totalHours)}</td>
                {withCost && <td className={`${cellCls} font-semibold`}>{chf(c.totalCost)}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a href={day.costCsvUrl(months)} download className="pill inline-flex min-h-[32px] items-center gap-1.5 px-4 py-1.5 text-[13.5px] font-medium" style={{ border: '1px solid var(--line-2)' }}><DownloadSimple size={13} weight="bold" /> CSV for the controller</a>
        <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Semicolons and a decimal comma, so Excel opens it as a table.</span>
      </div>
    </section>
  )
}

function Panel({ title, n, empty, children }) {
  const list = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : []
  const isEmpty = list.length === 0 || list.every(c => Array.isArray(c) ? c.length === 0 : !c)
  return (
    <section className="panel p-6 sm:p-7" aria-label={title}>
      <header className="flex items-baseline justify-between gap-4">
        <h3 className="display text-[22px] font-semibold leading-none">{title}.</h3>
        {n !== null && n !== undefined && <span className="tnum text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{n}</span>}
      </header>
      {isEmpty && empty ? <p className="mt-3 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{empty}</p> : <ul className="mt-4 flex flex-col gap-1.5">{children}</ul>}
    </section>
  )
}

function Row({ title, lead, meta, tone }) {
  return (
    <li className="row flex items-baseline gap-3 px-3.5 py-2.5 text-[13.5px]">
      {lead && <span className="tnum shrink-0" style={{ color: 'var(--ink-3)' }}>{lead}</span>}
      <span className="min-w-0 flex-1 truncate" title={title}>{title}</span>
      {meta && <span className="tnum shrink-0 text-[13px]" style={{ color: tone || 'var(--ink-3)' }}>{meta}</span>}
    </li>
  )
}
