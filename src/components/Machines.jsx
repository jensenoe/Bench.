import { useCallback, useEffect, useRef, useState } from 'react'
import { CaretLeft, Printer } from '@phosphor-icons/react'
import * as api from '../api/machines.js'
import TaskCard from './TaskCard.jsx'
import { PanelSkeleton } from './Skeleton.jsx'
import { STATUS } from '../scenes.js'
import { fmtDate, daysUntil } from '../lanes.js'
import { LANES } from '../copy.js'

/**
 * Machines (roadmap 79). One page per machine, derived from what is already on the board: the
 * project on a task, the BOM's machine, the logbook's project, a napkin title. Nothing is typed twice;
 * the only thing this page owns is which spellings are one machine and what it is called.
 */
const LANE_ORDER = ['today', 'active', 'waiting', 'innovation', 'parked']
const SOURCE_LABEL = { local: 'Board', issues: 'Issues', qms: 'QMS', bom: 'BOM', planner: 'Planner' }
const keyFromHash = () => new URLSearchParams(location.hash.split('?')[1] || '').get('m')
const printFromHash = () => new URLSearchParams(location.hash.split('?')[1] || '').get('print') === '1'
const toast = (text, by) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true } }))
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`

/** "4 open, 1 late, 2 orders": only what is there, in words. */
function countsLine(m) {
  const parts = [plural(m.open, 'open', 'open')]
  if (m.late) parts.push(`${m.late} late`)
  if (m.orders) parts.push(plural(m.orders, 'order'))
  if (m.waiting) parts.push(`${m.waiting} waiting`)
  if (!m.open && m.done) parts.push(plural(m.done, 'done', 'done'))
  return parts.join(', ')
}

const Dot = ({ tone, title }) => <span aria-hidden="true" title={title} className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: tone }} />

function Card({ m }) {
  return (
    <a href={`#/machines?m=${encodeURIComponent(m.key)}`} title="Open the machine: its open work, orders, tool items, Logbook entries and maps in one place" className="panel flex flex-col gap-3 p-6 transition-transform hover:-translate-y-[2px]">
      <h2 className="display text-[24px] font-semibold leading-none">{m.name}.</h2>
      <p className="flex items-center gap-2 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>
        <span>{countsLine(m)}</span>
        {m.late > 0 && <Dot tone={STATUS.overdue} title="late" />}
        {m.orders > 0 && <Dot tone={STATUS.caution} title="orders" />}
        {m.waiting > 0 && <Dot tone={STATUS.held} title="waiting" />}
      </p>
      <p className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{m.lastActivity ? `last activity ${fmtDate(m.lastActivity)}` : 'no activity yet'}</p>
    </a>
  )
}

function Panel({ title, aside, children }) {
  return (
    <section className="panel p-6 sm:p-7">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="display text-[22px] font-semibold leading-none">{title}</h3>
        {aside && <span className="tnum text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{aside}</span>}
      </div>
      {children}
    </section>
  )
}

/** One order row, in the shape of LeadTime: the part, who from, the dates, and a word about where it stands. */
function OrderRow({ r }) {
  const days = r.orderBy ? daysUntil(r.orderBy) : null
  const due = r.deliveryDate || r.dueDate
  const dueIn = due ? daysUntil(due) : null
  const delivered = Boolean(r.deliveredOn), ordered = Boolean(r.orderedOn)
  const color = delivered ? STATUS.done : ordered ? STATUS.held : days !== null && days < 0 ? STATUS.overdue : days !== null && days <= 7 ? STATUS.caution : 'var(--ink-2)'
  const word = delivered ? `delivered ${fmtDate(r.deliveredOn)}` : ordered ? `ordered ${fmtDate(r.orderedOn)}`
    : days === null ? 'not ordered' : days < 0 ? `${-days}d late` : days === 0 ? 'order today' : `order in ${days}d`
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3" style={{ borderTop: '1px solid var(--line)' }}>
      <a href={`#/board?task=${r.id}`} className="-my-[2px] min-w-[200px] flex-1 py-[2px] text-[14px] underline-offset-2 hover:underline">{r.title}</a>
      <span className="tnum flex flex-wrap gap-x-3 text-[13px]" style={{ color: 'var(--ink-3)' }}>
        {r.supplier && <span>{r.supplier}</span>}
        {r.poNumber && <span>PO {r.poNumber}</span>}
        {r.orderBy && <span>order by {fmtDate(r.orderBy)}</span>}
      </span>
      {due && <span className="tnum text-[13px]" style={{ color: dueIn !== null && dueIn < 0 && !delivered ? STATUS.overdue : 'var(--ink-2)' }}>due {fmtDate(due)}</span>}
      <span className="tnum min-w-[128px] text-right text-[13.5px] font-semibold" style={{ color }}>{word}</span>
    </li>
  )
}

function Rows({ children }) { return <ul className="mt-4 flex flex-col">{children}</ul> }
const LinkRow = ({ href, title, meta }) => (
  <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5" style={{ borderTop: '1px solid var(--line)' }}>
    <a href={href} className="-my-[2px] min-w-[200px] flex-1 py-[2px] text-[14px] underline-offset-2 hover:underline">{title}</a>
    {meta && <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{meta}</span>}
  </li>
)

// ── The passport (roadmap 112) ────────────────────────────────────────
const KIND = {
  task: { label: 'task', tone: 'var(--ink-3)' }, done: { label: 'done', tone: STATUS.done },
  order: { label: 'ordered', tone: STATUS.held }, delivery: { label: 'delivered', tone: STATUS.done },
  issue: { label: 'issue', tone: STATUS.caution }, qms: { label: 'QMS', tone: STATUS.caution },
  logbook: { label: 'logbook', tone: 'var(--ink-2)' }, decision: { label: 'decision', tone: 'var(--ink-2)' }, map: { label: 'napkin', tone: 'var(--ink-3)' }
}
const refHref = ({ page, id }) => page === 'board' ? `#/board?task=${id}` : page === 'logbook' ? `#/logbook?entry=${id}` : `#/napkin?map=${id}`
/** "first seen 1 Sep, 2 open, 2 done, 2 orders, 1 delivery, 1 entry": only what is there. */
function summaryLine(s) {
  const parts = []
  if (s.firstSeen) parts.push(`first seen ${fmtDate(s.firstSeen)}`)
  if (s.lastActivity) parts.push(`last activity ${fmtDate(s.lastActivity)}`)
  parts.push(`${s.open} open`, `${s.done} done`)
  if (s.orders) parts.push(plural(s.orders, 'order'))
  if (s.deliveries) parts.push(plural(s.deliveries, 'delivery', 'deliveries'))
  if (s.entries) parts.push(plural(s.entries, 'entry', 'entries'))
  if (s.decisions) parts.push(plural(s.decisions, 'decision'))
  return parts.join(', ')
}

/** One line of the timeline: the day, the kind as a small tag, the title, the detail. */
function TimelineRow({ x, link = true }) {
  const k = KIND[x.kind] || KIND.task
  const title = link ? <a href={refHref(x.ref)} className="-my-[2px] min-w-0 flex-1 py-[2px] text-[14px] underline-offset-2 hover:underline">{x.title}</a> : <span className="min-w-0 flex-1 text-[14px]">{x.title}</span>
  return (
    <li className="passport-row flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5" style={{ borderTop: '1px solid var(--line)' }}>
      <span className="tnum w-[92px] shrink-0 text-[13px]" style={{ color: 'var(--ink-3)' }}>{fmtDate(x.at)}</span>
      <span className="pill shrink-0 px-2 py-[1px] text-[12px] font-medium" style={{ color: k.tone, background: `color-mix(in srgb, ${k.tone} 14%, transparent)` }}>{k.label}</span>
      {title}
      {x.detail && <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{x.detail}</span>}
    </li>
  )
}

function usePassport(machineKey, tasks) {
  const [p, setP] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    let on = true
    const load = () => api.getPassport(machineKey).then(d => { if (on) { setP(d); setErr(null) } }).catch(e => on && setErr(e.message))
    load()
    addEventListener('bench:refresh', load)
    return () => { on = false; removeEventListener('bench:refresh', load) }
  }, [machineKey, tasks])
  return [p, err]
}

/** The passport on the detail page: the summary, the timeline, and Print, which opens the print view. */
function PassportPanel({ machineKey, tasks }) {
  const [p, err] = usePassport(machineKey, tasks)
  const [all, setAll] = useState(false)
  if (err) return <Panel title="Passport."><p className="mt-3 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{err}</p></Panel>
  if (!p) return <PanelSkeleton rows={5} />
  const rows = all ? p.timeline : p.timeline.slice(0, 30)
  return (
    <Panel title="Passport." aside={plural(p.timeline.length, 'line')}>
      <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>{summaryLine(p.summary)}.</p>
      {p.timeline.length === 0 && <p className="mt-3 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Nothing dated yet. Tasks, orders, deliveries, tickets and Logbook entries will line up here.</p>}
      <ul className="mt-4 flex flex-col">{rows.map((x, i) => <TimelineRow key={`${x.kind}-${x.ref.id}-${x.at}-${i}`} x={x} />)}</ul>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a href={`#/machines?m=${encodeURIComponent(machineKey)}&print=1`} title="Everything that happened to this machine on one printable black-on-white page" className="pill inline-flex min-h-[32px] items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium" style={{ background: 'var(--row)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}><Printer size={13} weight="bold" /> Print</a>
        {p.timeline.length > 30 && <button onClick={() => setAll(a => !a)} className="min-h-6 text-[13px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}>{all ? 'Show the last 30' : `Show all ${p.timeline.length}`}</button>}
      </div>
    </Panel>
  )
}

/**
 * The print view (#/machines?m=<key>&print=1): headline, summary and the whole timeline, nothing else.
 * The print stylesheet hides the rest of the page, sets black on white and page margins; the browser's
 * print dialog opens once the data is there.
 */
const PRINT_CSS = `
@media print {
  @page { margin: 18mm 16mm; }
  body * { visibility: hidden; }
  .passport-print, .passport-print * { visibility: visible; }
  .passport-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0; margin: 0; color: black; background: white; }
  .passport-print .pill { border: 1px solid black; background: none; color: black; }
  .passport-print .passport-row { border-top-color: black; break-inside: avoid; }
  .passport-print a { color: black; text-decoration: none; }
  .passport-print .no-print, img, video, canvas { display: none; }
}
`
function PassportPrint({ machineKey }) {
  const [p, err] = usePassport(machineKey, null)
  const printed = useRef(false)
  useEffect(() => {
    if (!p || printed.current) return
    printed.current = true
    const t = setTimeout(() => { try { window.print() } catch { /* headless or blocked */ } }, 250)
    return () => clearTimeout(t)
  }, [p])
  const back = <a href={`#/machines?m=${encodeURIComponent(machineKey)}`} className="no-print inline-flex min-h-6 items-center gap-1 text-[13.5px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}><CaretLeft size={13} weight="bold" /> Back to the machine</a>
  if (err) return <div className="flex flex-col gap-4">{back}<p className="text-[14px]" style={{ color: 'var(--ink-3)' }}>{err}</p></div>
  if (!p) return <div className="flex flex-col gap-4">{back}<PanelSkeleton rows={6} /></div>
  return (
    <section className="passport-print panel p-6 sm:p-7">
      <style>{PRINT_CSS}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        {back}
        <button onClick={() => window.print()} className="pill inline-flex min-h-[32px] items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}><Printer size={13} weight="bold" /> Print</button>
      </div>
      <h2 className="display text-[30px] font-semibold leading-none">{p.machine.name}.</h2>
      <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-2)' }}>Passport, printed {fmtDate(new Date().toISOString())}.</p>
      <p className="mt-1 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{summaryLine(p.summary)}.</p>
      <ul className="mt-5 flex flex-col">{p.timeline.map((x, i) => <TimelineRow key={`${x.kind}-${x.ref.id}-${x.at}-${i}`} x={x} link={false} />)}</ul>
      {p.timeline.length === 0 && <p className="mt-3 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Nothing dated yet.</p>}
    </section>
  )
}

/** The quiet last row: this is the same machine as another one, or it has a better name. */
function Housekeeping({ machine, others, onChanged }) {
  const [name, setName] = useState(machine.name)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setName(machine.name) }, [machine.key, machine.name])
  const merge = async (to) => {
    if (!to) return
    setBusy(true)
    try {
      const r = await api.aliasMachine(machine.key, to)
      toast('Same machine.', `${machine.name} now counts under ${others.find(o => o.key === to)?.name || to}.`)
      onChanged(r.key)
    } catch (e) { toast('That did not work.', e.message) } finally { setBusy(false) }
  }
  const rename = async (e) => {
    e.preventDefault()
    const n = name.trim()
    if (!n || n === machine.name) return
    setBusy(true)
    try { await api.renameMachine(machine.key, n); toast('Renamed.', `${machine.name} is ${n} now.`); onChanged(machine.key) }
    catch (err) { toast('That did not work.', err.message) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-4 px-2 py-4 text-[13px]" style={{ color: 'var(--ink-3)' }}>
      {others.length > 0 && (
        <label className="flex flex-col gap-1.5">
          <span>Same machine as…</span>
          <select aria-label={`${machine.name} is the same machine as`} title="The same machine spelled differently? Pick the other name and the two merge; tasks and entries then count under one machine" value="" disabled={busy} onChange={e => merge(e.target.value)} className="field min-h-[32px] px-2.5 py-1.5 text-[13px]">
            <option value="">pick one</option>
            {others.map(o => <option key={o.key} value={o.key}>{o.name}</option>)}
          </select>
        </label>
      )}
      <form onSubmit={rename} className="flex items-end gap-2">
        <label className="flex flex-col gap-1.5">
          <span>Called</span>
          <input value={name} onChange={e => setName(e.target.value)} disabled={busy} aria-label="Machine name" title="The name shown everywhere for this machine; the tasks keep their own project text and still count here" className="field min-h-[32px] w-[220px] px-2.5 py-1.5 text-[13px]" />
        </label>
        <button type="submit" disabled={busy || !name.trim() || name.trim() === machine.name} className="pill min-h-[32px] px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-40" style={{ background: 'var(--row)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}>Rename</button>
      </form>
    </div>
  )
}

function Detail({ machineKey, machines, tasks, onPatch, onDelete }) {
  const [data, setData] = useState(null)
  const [missing, setMissing] = useState(false)
  const load = useCallback(() => {
    let on = true
    api.getMachine(machineKey).then(d => { if (on) { setData(d); setMissing(false) } }).catch(() => { if (on) setMissing(true) })
    return () => { on = false }
  }, [machineKey])
  useEffect(() => { setData(null) }, [machineKey])
  // The board's own writes (a tick, a lane change) arrive as a new tasks array; the detail follows.
  useEffect(() => load(), [tasks, load])
  useEffect(() => { addEventListener('bench:refresh', load); return () => removeEventListener('bench:refresh', load) }, [load])

  const back = <a href="#/machines" className="inline-flex min-h-6 items-center gap-1 text-[13.5px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}><CaretLeft size={13} weight="bold" /> All machines</a>
  if (missing) return <div className="flex flex-col gap-4">{back}<p className="text-[14px]" style={{ color: 'var(--ink-3)' }}>That machine is not on the list any more.</p></div>
  if (!data) return <div className="flex flex-col gap-4">{back}<PanelSkeleton rows={4} /><PanelSkeleton rows={3} /></div>

  const { machine: m, procurement, bySource, entries, maps, mentions } = data
  const byId = new Map(tasks.map(t => [t.id, t]))
  const groups = LANE_ORDER.map(l => [l, (data.tasks[l] || []).map(t => byId.get(t.id) || t).filter(t => !t.done)]).filter(([, list]) => list.length)
  const sources = Object.entries(bySource).filter(([, n]) => n > 0)
  const others = machines.filter(x => x.key !== m.key)
  const assign = async (t) => {
    try { await api.assignMachine(t.id, m.key); toast('Assigned.', `${t.title} is on ${m.name} now.`); window.dispatchEvent(new Event('bench:refresh')) }
    catch (e) { toast('That did not work.', e.message) }
  }
  const onChanged = (key) => { window.dispatchEvent(new Event('bench:refresh')); if (key !== machineKey) location.hash = `#/machines?m=${encodeURIComponent(key)}` }

  return (
    <div className="flex flex-col gap-4">
      <div>
        {back}
        <h2 className="display mt-3 text-[30px] font-semibold leading-none">{m.name}.</h2>
        <p className="mt-2 flex items-center gap-2 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>
          <span>{countsLine(m)}</span>
          {m.late > 0 && <Dot tone={STATUS.overdue} title="late" />}
          {m.orders > 0 && <Dot tone={STATUS.caution} title="orders" />}
          {m.waiting > 0 && <Dot tone={STATUS.held} title="waiting" />}
          {m.lastActivity && <span className="tnum ml-3">last activity {fmtDate(m.lastActivity)}</span>}
        </p>
      </div>

      <Panel title="Open." aside={m.open ? plural(m.open, 'task') : null}>
        {groups.length === 0 && <p className="mt-3 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Nothing open.</p>}
        {groups.map(([lane, list]) => (
          <div key={lane} className="mt-4">
            <h4 className="text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>{LANES[lane].label}</h4>
            <ul className="mt-2 flex flex-col gap-2">
              {list.map(t => <TaskCard key={t.id} task={t} onPatch={onPatch} onDelete={onDelete} draggable={false} />)}
            </ul>
          </div>
        ))}
      </Panel>

      {procurement.length > 0 && (
        <Panel title="Orders." aside={plural(procurement.length, 'part')}>
          <Rows>{procurement.map(r => <OrderRow key={r.id} r={r} />)}</Rows>
        </Panel>
      )}

      {sources.length > 0 && (
        <Panel title="From the tools.">
          <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
            {sources.map(([s, n]) => (
              <li key={s} className="flex items-baseline gap-2 text-[14px]">
                <span className="display tnum text-[24px] font-semibold leading-none">{n}</span>
                <span style={{ color: 'var(--ink-3)' }}>{n === 1 ? 'open item' : 'open items'} from {SOURCE_LABEL[s] || s}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {entries.length > 0 && (
        <Panel title="Logbook." aside={plural(entries.length, 'entry', 'entries')}>
          <Rows>{entries.map(e => <LinkRow key={e.id} href={`#/logbook?entry=${e.id}`} title={e.title} meta={fmtDate(e.date)} />)}</Rows>
        </Panel>
      )}

      {maps.length > 0 && (
        <Panel title="Napkin." aside={plural(maps.length, 'map')}>
          <Rows>{maps.map(x => <LinkRow key={x.id} href={`#/napkin?map=${x.id}`} title={x.title} />)}</Rows>
        </Panel>
      )}

      {mentions.length > 0 && (
        <Panel title="Mentions." aside={plural(mentions.length, 'task')}>
          <p className="mt-1.5 max-w-[60ch] text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>These name {m.name} but sit under another project, or none. Assign moves them here.</p>
          <ul className="mt-4 flex flex-col">
            {mentions.map(t => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5" style={{ borderTop: '1px solid var(--line)' }}>
                <a href={`#/board?task=${t.id}`} className="-my-[2px] min-w-[200px] flex-1 py-[2px] text-[14px] underline-offset-2 hover:underline">{t.title}</a>
                {t.project && <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{t.project}</span>}
                <button onClick={() => assign(t)} className="pill min-h-6 px-3 py-1 text-[12.5px] font-medium" style={{ background: 'var(--row)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}>Assign</button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <PassportPanel machineKey={m.key} tasks={tasks} />

      <Housekeeping machine={m} others={others} onChanged={onChanged} />
    </div>
  )
}

export default function Machines({ tasks = [], onPatch, onDelete }) {
  const [machines, setMachines] = useState(null)
  const [key, setKey] = useState(keyFromHash)
  const [print, setPrint] = useState(printFromHash)
  useEffect(() => {
    const on = () => { setKey(keyFromHash()); setPrint(printFromHash()) }
    addEventListener('hashchange', on); return () => removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    let on = true
    const load = () => api.getMachines().then(m => on && setMachines(m)).catch(() => on && setMachines([]))
    load()
    addEventListener('bench:refresh', load)
    return () => { on = false; removeEventListener('bench:refresh', load) }
  }, [tasks])

  return (
    <main className="mx-auto col px-6">
      {key && print
        ? <PassportPrint machineKey={key} />
        : key
        ? <Detail machineKey={key} machines={machines || []} tasks={tasks} onPatch={onPatch} onDelete={onDelete} />
        : machines === null ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3"><PanelSkeleton rows={2} /><PanelSkeleton rows={2} /></div>
        : machines.length === 0
          ? <section className="panel p-7"><h2 className="display text-[30px] font-semibold leading-none">Machines.</h2>
            <p className="mt-3 max-w-[60ch] text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Put a project on a task, or a project on a logbook entry, and the machine appears here with everything that hangs on it.</p></section>
          : <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{machines.map(m => <Card key={m.key} m={m} />)}</div>}
    </main>
  )
}
