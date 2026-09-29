import { STATUS } from '../scenes.js'

/**
 * The innovation portfolio over time (roadmap 162): one row per open project on an axis from eight weeks back
 * to twelve weeks ahead, today in the accent. A row shows the current stage since it began (when the change feed
 * knows), the earlier stages between known moves, the due date as a diamond (late in --late, with the time it
 * has run over), and a small bar of open tasks and Logbook actions. Above it, the last 30 days in numbers.
 * The axis scrolls inside its own box on a phone; the page never does.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const noon = iso => new Date(`${String(iso).slice(0, 10)}T12:00:00`)
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (iso, n) => { const d = noon(iso); d.setDate(d.getDate() + n); return isoOf(d) }
const between = (a, b) => Math.round((noon(b) - noon(a)) / 86400000)
const fmt = iso => { if (!iso) return ''; const d = noon(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}` }
const ago = n => n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`

export const BACK_DAYS = 56, AHEAD_DAYS = 84
const SPAN = BACK_DAYS + AHEAD_DAYS
/** Where a date falls on the axis, in percent; clamped to the box, with a flag when it had to be. */
const at = (start, iso) => { const x = (between(start, iso) / SPAN) * 100; return { x: Math.max(0, Math.min(100, x)), out: x < 0 ? -1 : x > 100 ? 1 : 0 } }

/** "Moved to Testing 12 days ago", "In Testing since 3 Aug or earlier", "In Testing". */
export function stageLine(p) {
  if (p.stage < 0) return p.bucket ? `In "${p.bucket}", not one of the stages` : 'No stage in Planner'
  if (p.stageSince && p.stageSinceExact) return `Moved to ${p.stageName} ${ago(p.daysInStage)}`
  if (p.stageSince) return `In ${p.stageName} since ${fmt(p.stageSince)} or earlier`
  return `In ${p.stageName}`
}

const INK = a => `rgba(var(--ink-rgb),${a})`
const LEFT = '16rem', RIGHT = '7.5rem', GAP = '1.25rem'
const COLS = { gridTemplateColumns: `${LEFT} minmax(0,1fr) ${RIGHT}`, columnGap: GAP }

// ── the last 30 days ──────────────────────────────────────────────────
const Fig = ({ value, label, tone, bar }) => (
  <div className="min-w-0">
    {bar !== undefined && <span aria-hidden="true" className="mb-2 block h-[3px] rounded-full" style={{ background: bar ? INK(0.34) : 'var(--wash-2)' }} />}
    <div className="display tnum text-[24px] font-semibold leading-none" style={{ color: tone || 'var(--ink)' }}>{value}</div>
    <div className="mt-1.5 truncate text-[12.5px]" style={{ color: 'var(--ink-3)' }} title={label}>{label}</div>
  </div>
)

export function MonthSummary({ summary }) {
  if (!summary) return null
  const { stages, other, movedProjects, overdue, decisions } = summary
  return (
    <section aria-labelledby="pf-month" className="mt-5">
      <h3 id="pf-month" className="display text-[17px] font-semibold leading-none">This month.</h3>
      <div className="mt-4 flex flex-wrap gap-x-12 gap-y-6">
        <div className="min-w-0 flex-[5_1_20rem]">
          <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Open, by stage{other ? `, and ${other} in another bucket` : ''}</p>
          <div className="mt-2.5 grid grid-cols-3 gap-x-4 gap-y-4 sm:grid-cols-5">
            {stages.map(s => <Fig key={s.key} value={s.count} label={s.name} bar={s.count > 0} />)}
          </div>
        </div>
        <div className="min-w-0 flex-[3_1_14rem]">
          <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>The last 30 days</p>
          <div className="mt-2.5 grid grid-cols-3 gap-x-4 gap-y-4">
            <Fig value={movedProjects} label="moved stage" bar={false} />
            <Fig value={overdue} label="overdue" tone={overdue ? STATUS.overdue : undefined} bar={false} />
            <Fig value={decisions.length} label={decisions.length === 1 ? 'decision' : 'decisions'} bar={false} />
          </div>
        </div>
      </div>
    </section>
  )
}

// ── the axis ──────────────────────────────────────────────────────────
function monthTicks(start) {
  const out = []
  const d = noon(start); d.setDate(1); d.setMonth(d.getMonth() + 1)
  for (; ;) {
    const iso = isoOf(d), x = (between(start, iso) / SPAN) * 100
    if (x > 100) break
    out.push({ iso, x, label: d.getMonth() === 0 ? `${MONTHS[0]} ${d.getFullYear()}` : MONTHS[d.getMonth()] })
    d.setMonth(d.getMonth() + 1)
  }
  return out
}

/** One project's track: earlier stages, the current one up to today, the due date and how far it ran over. */
function Track({ p, start, today }) {
  const now = at(start, today).x
  const moves = p.moves || []
  const segs = []
  for (let k = 1; k < moves.length; k++) segs.push({ from: moves[k - 1].date, to: moves[k].date, name: moves[k].from })
  const since = p.stageSince ? at(start, p.stageSince) : null
  const due = p.due ? at(start, p.due) : null
  const late = p.overdue > 0
  const dueLabel = due ? `${late ? 'due ' : ''}${fmt(p.due)}${due.out ? (due.out > 0 ? ' →' : '') : ''}` : ''
  // a late label reads back from its diamond, into the past, so it never sits on the today line
  const labelAlign = !due ? '' : late ? (due.x < 14 ? 'left' : 'right') : due.x > 88 ? 'right' : due.x - now < 7 || due.x < 12 ? 'left' : 'center'
  return (
    <div className="relative h-11" aria-hidden="true">
      <span className="absolute inset-x-0 top-[26px] h-px" style={{ background: 'var(--line-2)' }} />
      {segs.map((s, i) => {
        const a = at(start, s.from).x, b = at(start, s.to).x
        return b > a ? <span key={i} title={`${s.name}, ${fmt(s.from)} to ${fmt(s.to)}`} className="absolute top-[23.5px] h-[6px] rounded-full" style={{ left: `${a}%`, width: `${b - a}%`, background: INK(0.16) }} /> : null
      })}
      {since && now > since.x && (
        <span title={`${p.stageName} since ${fmt(p.stageSince)}${p.stageSinceExact ? '' : ' or earlier'}`} className="absolute top-[23.5px] h-[6px]"
          style={{ left: `${since.x}%`, width: `${now - since.x}%`, background: INK(0.34), borderRadius: since.out < 0 || !p.stageSinceExact ? '0 9999px 9999px 0' : '9999px' }} />
      )}
      {moves.map((m, i) => {
        const x = at(start, m.date)
        return x.out ? null : <span key={i} title={`Moved to ${m.to}, ${fmt(m.date)}`} className="absolute top-[22.5px] h-2 w-2 -translate-x-1/2 rounded-full" style={{ left: `${x.x}%`, background: 'var(--ink-2)', boxShadow: '0 0 0 2px var(--panel)' }} />
      })}
      {due && late && now > due.x && <span className="absolute top-[25.5px] h-[3px] rounded-full" style={{ left: `${due.x}%`, width: `${now - due.x}%`, background: `color-mix(in srgb, ${STATUS.overdue} 55%, transparent)` }} />}
      {due && !late && due.x > now && <span className="absolute top-[26px] h-0 border-t border-dashed" style={{ left: `${now}%`, width: `${due.x - now}%`, borderColor: INK(0.3) }} />}
      {due && (
        <>
          <span className="absolute top-[21.5px] h-[9px] w-[9px] -translate-x-1/2 rotate-45 rounded-[2px]" style={{ left: `${due.x}%`, background: late ? STATUS.overdue : 'var(--ink)', boxShadow: '0 0 0 2px var(--panel)' }} />
          <span className="tnum absolute top-[2px] whitespace-nowrap text-[12px] leading-[14px]"
            style={{ left: `${due.x}%`, transform: labelAlign === 'center' ? 'translateX(-50%)' : labelAlign === 'right' ? 'translateX(calc(-100% + 6px))' : 'translateX(-6px)', color: late ? STATUS.overdue : 'var(--ink-2)' }}>{dueLabel}</span>
        </>
      )}
    </div>
  )
}

/** Open tasks and open actions as one small bar, scaled to the busiest project, with the count in words. */
function Work({ p, most }) {
  const total = p.open + p.openActions
  const w = n => `${most ? (n / most) * 100 : 0}%`
  return (
    <div className="min-w-0">
      <div className="flex h-[5px] w-full gap-[2px] overflow-hidden rounded-full" style={{ background: 'var(--wash)' }} aria-hidden="true">
        {p.open > 0 && <span className="block h-full rounded-full" style={{ width: w(p.open), background: INK(0.34) }} />}
        {p.openActions > 0 && <span className="block h-full rounded-full" style={{ width: w(p.openActions), background: p.staleActions ? STATUS.caution : INK(0.62) }} />}
      </div>
      <div className="tnum mt-1.5 truncate text-[12px]" style={{ color: 'var(--ink-3)' }}>
        {total ? [p.open ? plural(p.open, 'task') : null, p.openActions ? plural(p.openActions, 'action') : null].filter(Boolean).join(', ') : 'nothing open'}
      </div>
    </div>
  )
}

export function PortfolioTimeline({ projects, today }) {
  const open = projects.filter(p => !p.done)
  if (!open.length) return <p className="mt-5 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>No open project to put on the timeline. A done card stays in the list.</p>
  const start = addDays(today, -BACK_DAYS)
  const ticks = monthTicks(start)
  const now = at(start, today).x
  const most = Math.max(1, ...open.map(p => p.open + p.openActions))
  return (
    <div className="mt-6 overflow-x-auto" tabIndex={0} role="region" aria-label="Timeline of the open projects, eight weeks back to twelve weeks ahead">
      <div className="relative min-w-[760px]">
        {/* month lines and today, once across all rows */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0" style={{ left: `calc(${LEFT} + ${GAP})`, right: `calc(${RIGHT} + ${GAP})` }}>
          {ticks.map(t => <span key={t.iso} className="absolute inset-y-0 w-px" style={{ left: `${t.x}%`, background: 'var(--line)' }} />)}
          <span className="absolute bottom-0 top-[22px] w-[1.5px] -translate-x-1/2" style={{ left: `${now}%`, background: 'var(--accent)' }} />
        </div>
        <div className="grid items-end pb-2" style={COLS}>
          <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{plural(open.length, 'open project')}</span>
          <div className="relative h-5" aria-hidden="true">
            {ticks.filter(t => Math.abs(t.x - now) > 4).map(t => <span key={t.iso} className="absolute bottom-0 pl-1.5 text-[12px] leading-none" style={{ left: `${t.x}%`, color: 'var(--ink-3)' }}>{t.label}</span>)}
            <span className="absolute bottom-0 -translate-x-1/2 rounded-full px-1.5 text-[12px] font-medium leading-none" style={{ left: `${now}%`, color: 'var(--accent)', background: 'var(--panel)' }}>Today</span>
          </div>
          <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Open work</span>
        </div>
        <ul className="relative flex flex-col">
          {open.map(p => (
            <li key={p.code} className="rule grid items-center py-2" style={COLS}>
              <a href={`#/projects?i=${encodeURIComponent(p.code)}`} className="-mx-2 block min-w-0 rounded-[10px] px-2 py-1 transition-colors hover:bg-[var(--wash)]">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="tnum shrink-0 text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>{p.code}</span>
                  <span className="truncate text-[14px]" title={p.name}>{p.name}</span>
                </span>
                <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: 'var(--ink-2)' }} data-volatile>{stageLine(p)}</span>
                <span className="sr-only">{p.due ? (p.overdue ? `, due ${fmt(p.due)}, ${plural(p.overdue, 'day')} over` : `, due ${fmt(p.due)}`) : ', no due date'}</span>
              </a>
              <Track p={p} start={start} today={today} />
              <Work p={p} most={most} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
