import { useEffect, useState } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import * as api from '../api.js'
import { shortDate } from '../lanes.js'
import { LedgerSkeleton } from './Skeleton.jsx'

/**
 * The month, the way the Zeiterfassung sheet has it: one row per day, in, out, break, worked.
 * Punches still waiting to reach the sheet are marked, failed ones say why, an open day is flagged.
 * This is the page to look at before someone else looks at the sheet.
 *
 * Set as telemetry, on purpose the one exception in Bench.: monospace figures, a one-pixel grid, no
 * card. A time sheet is a table first, so it looks like one (roadmap 66).
 */
const hm = (ms) => { const m = Math.round((ms || 0) / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` }
const t = (iso) => iso ? new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : ''
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const mark = (d) =>
  d.failed ? { word: 'failed', tone: 'var(--late)', title: d.failed }
    : d.unclosed ? { word: 'needs closing', tone: 'var(--caution)' }
      : d.pending ? { word: `${d.pending} waiting`, tone: 'var(--caution)' }
        : d.closedLater ? { word: 'closed later', tone: 'var(--ink-3)' }
          : d.in ? { word: 'written', tone: 'var(--ok)' } : null

const Figure = ({ value, label, tone }) => (
  <div className="px-6 py-4" style={{ borderLeft: '1px solid var(--line)' }}>
    <div className="mono text-[28px] font-medium leading-none" style={{ color: tone }}>{value}</div>
    <div className="mt-1.5 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{label}</div>
  </div>
)

export default function Hours({ clock }) {
  const [month, setMonth] = useState(() => ym(new Date()))
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { let on = true; api.getMonth(month).then(d => on && setData(d)).catch(e => on && setErr(e.message)); return () => { on = false } }, [month, clock?.events?.length, clock?.unclosed])
  const shift = (n) => { const [y, m] = month.split('-').map(Number); setMonth(ym(new Date(y, m - 1 + n, 1))) }
  const title = new Date(month + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const isNow = month === ym(new Date())
  const pending = data?.days.reduce((s, d) => s + d.pending, 0) || 0
  const failed = data?.days.filter(d => d.failed) || []

  return (
    <main className="mx-auto col px-6">
      <section aria-labelledby="hours-month" className="overflow-hidden" style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 20 }}>
        {/* the strip: month, sheet, figures. Cells, not cards. */}
        <div className="flex flex-wrap items-stretch">
          <div className="flex min-w-0 flex-1 flex-col justify-center px-6 py-4">
            <div className="flex items-center gap-2">
              <button onClick={() => shift(-1)} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-full" style={{ border: '1px solid var(--line)' }}><CaretLeft size={13} weight="bold" /></button>
              <h2 id="hours-month" className="display min-w-[210px] text-center text-[24px] font-semibold leading-none">{title}.</h2>
              <button onClick={() => shift(1)} disabled={isNow} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-full disabled:opacity-30" style={{ border: '1px solid var(--line)' }}><CaretRight size={13} weight="bold" /></button>
            </div>
            {data && <p className="mono mt-2 truncate text-[12.5px]" style={{ color: 'var(--ink-3)' }} title={`${data.sheet} in ${data.workbook}`}>{data.sheet} <span style={{ color: 'rgba(var(--ink-rgb),.3)' }}>/</span> {data.workbook}</p>}
          </div>
          {data && (
            <div className="flex">
              <Figure value={hm(data.worked)} label="on the clock" />
              <Figure value={String(data.daysWorked)} label="days" />
              <Figure value={String(pending)} label="waiting for the sheet" tone={pending ? 'var(--caution)' : 'var(--ink-3)'} />
              {failed.length > 0 && <Figure value={String(failed.length)} label="failed" tone="var(--late)" />}
            </div>
          )}
        </div>

        {err && <p role="alert" className="px-6 py-3 text-[13px]" style={{ borderTop: '1px solid var(--line)', color: 'var(--late)' }}>{err}</p>}
        {failed.length > 0 && (
          <p className="px-6 py-3 text-[13px]" style={{ borderTop: '1px solid var(--line)', color: 'var(--caution)' }}>{failed[0].failed}</p>
        )}

        {!data && !err && <LedgerSkeleton />}
        {data && (
          <table className="ledger mono w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="text-left" style={{ color: 'var(--ink-3)' }}>
                <th scope="col" className="px-6 py-2 font-normal">Day</th>
                <th scope="col" className="px-4 py-2 font-normal">In</th>
                <th scope="col" className="px-4 py-2 font-normal">Out</th>
                <th scope="col" className="px-4 py-2 font-normal">Break</th>
                <th scope="col" className="px-4 py-2 text-right font-normal">Worked</th>
                <th scope="col" className="px-6 py-2 font-normal">Sheet</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map(d => {
                const weekend = d.weekday === 0 || d.weekday === 6
                const empty = !d.worked && !d.in
                const m = mark(d)
                return (
                  <tr key={d.date} style={{
                    background: d.today ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : 'transparent',
                    boxShadow: d.today ? 'inset 2px 0 0 var(--accent)' : 'none' }}>
                    <th scope="row" className="px-6 py-[7px] text-left font-normal" style={{ color: d.today ? 'var(--ink)' : (d.future || (weekend && empty)) ? 'var(--ink-3)' : 'var(--ink-2)' }}>{shortDate(new Date(d.date + 'T12:00:00'))}</th>
                    <td className="px-4 py-[7px]">{t(d.in)}</td>
                    <td className="px-4 py-[7px]">{d.open && !d.today ? <span style={{ color: 'var(--caution)' }}>open</span> : t(d.out)}</td>
                    <td className="px-4 py-[7px]" style={{ color: 'var(--ink-3)' }}>{d.breakMs ? hm(d.breakMs) : ''}</td>
                    <td className="px-4 py-[7px] text-right" style={{ color: d.worked ? 'var(--ink)' : 'var(--ink-3)' }}>{d.worked ? hm(d.worked) : ''}</td>
                    <td className="px-6 py-[7px]">
                      {m && <span className="inline-flex items-center gap-2" title={m.title} style={{ color: m.tone }}>
                        <span aria-hidden="true" className="inline-block h-[7px] w-[7px]" style={{ background: m.tone }} />{m.word}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <p className="px-6 py-4 text-[13px] leading-relaxed" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-3)' }}>
          Written means every punch of that day reached the workbook. Waiting means Bench still holds it, usually because Microsoft 365 was not connected at the time; it writes on the next connection. The sheet itself stays the record; this page is the receipt.
        </p>
      </section>
    </main>
  )
}
