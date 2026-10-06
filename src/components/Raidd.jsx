import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Plus, Trash, Warning, Lightbulb, WarningOctagon, ArrowsLeftRight, Gavel, CaretDown, X, ArrowSquareOut } from '@phosphor-icons/react'
import { getRaidd, createRaidd, patchRaidd, removeRaidd } from '../api/raidd.js'
import DateField from './DateField.jsx'
import { PanelSkeleton } from './Skeleton.jsx'
import LoadFailed from './LoadFailed.jsx'
import { ask } from './Confirm.jsx'
import { STATUS } from '../scenes.js'
import { fmtDate } from '../lanes.js'

/**
 * The RAIDD log of one project (roadmap 168): Risks, Assumptions, Issues, Dependencies and Decisions, from
 * server/raidd.js. `projectKey` is the I-code ("I-1050") or "plan:<id>"; `people` feeds the owner suggestions.
 * Five counters that filter, the open risks on a 5 by 5 heat map, and the entries as a ledger, the most
 * severe first; a line opens in place to edit it. Decisions written in a Logbook entry that names the project
 * show here too, read-only, with a link to the entry. `bare` leaves out the panel when a page already has one.
 */
const btn = 'pill inline-flex min-h-[32px] items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-50'
const quiet = btn + ' btn-quiet', primary = btn + ' btn-primary', ghost = btn + ' btn-ghost'
const INP = 'field w-full px-3 py-2 text-[14px]'
const LABEL = 'text-[12.5px]'
const toast = (text, by, undo) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true, undo } }))
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// ── what the types are ────────────────────────────────────────────────
const TYPES = ['risk', 'assumption', 'issue', 'dependency', 'decision']
const TYPE = {
  risk: { one: 'Risk', many: 'Risks', icon: Warning, dateLabel: 'Review on', dateKey: 'reviewOn', datePrefix: 'review' },
  assumption: { one: 'Assumption', many: 'Assumptions', icon: Lightbulb, dateLabel: 'Validate by', dateKey: 'validateBy', datePrefix: 'validate by' },
  issue: { one: 'Issue', many: 'Issues', icon: WarningOctagon, dateLabel: 'Due', dateKey: 'due', datePrefix: 'due' },
  dependency: { one: 'Dependency', many: 'Dependencies', icon: ArrowsLeftRight, dateLabel: 'Need by', dateKey: 'needBy', datePrefix: 'need by' },
  decision: { one: 'Decision', many: 'Decisions', icon: Gavel, dateLabel: 'Decided on', dateKey: 'decidedOn', datePrefix: '' }
}
const STATUSES = {
  risk: ['open', 'mitigating', 'closed'],
  assumption: ['open', 'validated', 'invalid'],
  issue: ['open', 'in progress', 'resolved'],
  dependency: ['open', 'at risk', 'met'],
  decision: ['made']
}
const CLOSED = { risk: ['closed'], assumption: ['validated', 'invalid'], issue: ['resolved'], dependency: ['met'], decision: ['made'] }
const LIKELIHOOD = ['rare', 'unlikely', 'possible', 'likely', 'almost certain']
const IMPACT = ['negligible', 'minor', 'moderate', 'major', 'severe']
const isOpen = e => !CLOSED[e.type]?.includes(e.status)
const keyDate = e => e[TYPE[e.type]?.dateKey] || null
const isLate = (e, today) => isOpen(e) && Boolean(keyDate(e)) && keyDate(e) < today
/** The same four levels as server/raidd.js riskLevel. */
const riskLevel = s => !s ? null : s >= 20 ? 'critical' : s >= 10 ? 'high' : s >= 5 ? 'medium' : 'low'
const LEVEL_TONE = { critical: STATUS.overdue, high: STATUS.overdue, medium: STATUS.caution, low: null }
const STATUS_TONE = { 'at risk': STATUS.caution, invalid: STATUS.overdue, mitigating: STATUS.held, 'in progress': STATUS.held, closed: STATUS.done, resolved: STATUS.done, met: STATUS.done, validated: STATUS.done }
const SEVERITY_WEIGHT = { high: 18, medium: 10, low: 4 }
const weight = (e, today) => {
  if (!isOpen(e)) return -1
  const late = isLate(e, today) ? 6 : 0
  if (e.type === 'risk') return (e.score || 0) + late
  if (e.type === 'issue') return (SEVERITY_WEIGHT[e.severity] || 10) + late
  if (e.type === 'dependency') return (e.status === 'at risk' ? 14 : 7) + late
  if (e.type === 'assumption') return 6 + late
  return 0
}
const newest = (a, b) => String(b.createdAt || b.decidedOn || '').localeCompare(String(a.createdAt || a.decidedOn || ''))
const SORTS = {
  severity: { label: 'Most severe first', fn: today => (a, b) => weight(b, today) - weight(a, today) || newest(a, b) },
  newest: { label: 'Newest first', fn: () => newest },
  date: { label: 'By date', fn: () => (a, b) => String(keyDate(a) || '9999').localeCompare(String(keyDate(b) || '9999')) || newest(a, b) }
}
const SORT_KEY = 'bench.raidd.sort'
// 10 percent, not the usual 14: --late and --caution type on paper keeps 4.5:1 on it (axe checked)
const tint = (tone, pct = 10) => `color-mix(in srgb, ${tone} ${pct}%, transparent)`

// ── small pieces ──────────────────────────────────────────────────────
/** A chip that means something: tinted with its functional colour. Plain facts stay plain text. */
function Chip({ tone, children }) {
  if (!tone) return <span className="tag tnum text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{children}</span>
  return <span className="tag tnum rounded-[4px] px-1.5 py-0.5 text-[12.5px] font-medium" style={{ color: tone, background: tint(tone) }}>{children}</span>
}

function Counters({ counts, filter, onFilter, total }) {
  const item = (key, name, n, aria) => (
    <button key={key} type="button" onClick={() => onFilter(key)} aria-pressed={filter === key} aria-label={aria}
      className={btn + ' btn-ghost'} style={filter === key ? { background: 'var(--wash-2)', color: 'var(--ink)' } : undefined}>
      {name}<span className="tnum" style={{ color: filter === key ? 'var(--ink-2)' : 'var(--ink-3)' }}>{n}</span>
    </button>
  )
  return (
    <div role="group" aria-label="Show" className="flex flex-wrap items-center gap-1">
      {item('all', 'All', total, `All, ${total} open`)}
      {TYPES.map(t => {
        const c = counts?.[t] || { open: 0, total: 0 }
        const n = t === 'decision' ? c.total : c.open
        return item(t, TYPE[t].many, n, t === 'decision' ? `Decisions, ${n}` : `${TYPE[t].many}, ${n} open`)
      })}
    </div>
  )
}

/** The cell's wash: the level's colour, stronger with more risks in it. Low cells stay a quiet grey. */
function cellFill(level, n) {
  if (level === 'low') return n ? 'var(--wash-2)' : 'var(--wash)'
  const tone = level === 'medium' ? 'var(--caution)' : 'var(--late)'
  const base = level === 'critical' ? 22 : level === 'high' ? 14 : 12
  return tint(tone, n ? Math.min(base + 18 + n * 8, 64) : base)
}

/** Open risks on a 5 by 5 grid: likelihood up the side, impact across. A cell with risks picks them out below. */
function HeatMap({ grid, cell, onCell }) {
  return (
    <figure className="m-0 flex items-stretch gap-2" aria-label="Open risks by likelihood and impact">
      <figcaption className="sr-only">Open risks on a grid of likelihood from 1 to 5 against impact from 1 to 5. Choose a cell to show its risks.</figcaption>
      <div className="flex items-center"><span className="text-[12px] [writing-mode:vertical-rl] rotate-180" style={{ color: 'var(--ink-3)' }}>Likelihood</span></div>
      <div>
        <div className="grid grid-cols-[14px_repeat(5,28px)] gap-[3px]">
          {[5, 4, 3, 2, 1].map(l => [
            <span key={`l${l}`} className="tnum self-center text-right text-[12px]" style={{ color: 'var(--ink-3)' }} aria-hidden="true">{l}</span>,
            ...[1, 2, 3, 4, 5].map(i => {
              const ids = grid?.[l - 1]?.[i - 1] || []
              const level = riskLevel(l * i)
              const on = cell && cell.l === l && cell.i === i
              const style = { background: cellFill(level, ids.length), color: 'var(--ink)', outline: on ? '2px solid var(--ink)' : undefined, outlineOffset: on ? '-2px' : undefined }
              const label = `Likelihood ${l}, impact ${i}, ${level}: ${ids.length} open ${ids.length === 1 ? 'risk' : 'risks'}`
              return ids.length
                ? <button key={`${l}-${i}`} type="button" onClick={() => onCell(on ? null : { l, i })} aria-pressed={on} aria-label={label} title={label}
                    className="tnum grid h-7 w-7 place-items-center rounded-[4px] text-[12.5px] font-semibold transition-[filter] hover:brightness-110" style={style}>{ids.length}</button>
                : <span key={`${l}-${i}`} className="block h-7 w-7 rounded-[4px]" style={style} title={label} aria-hidden="true" />
            })
          ])}
          <span aria-hidden="true" />
          {[1, 2, 3, 4, 5].map(i => <span key={`i${i}`} className="tnum text-center text-[12px]" style={{ color: 'var(--ink-3)' }} aria-hidden="true">{i}</span>)}
        </div>
        <p className="mt-1 pl-[17px] text-center text-[12px]" style={{ color: 'var(--ink-3)' }} aria-hidden="true">Impact</p>
      </div>
    </figure>
  )
}

/** What needs a look, as one line: the count and the colour of each kind of trouble. */
function Attention({ summary }) {
  if (!summary) return null
  const bits = [
    [summary.highRisks?.length, n => `${n} high or critical ${n === 1 ? 'risk' : 'risks'}`, STATUS.overdue],
    [summary.overdueIssues?.length, n => `${n} ${n === 1 ? 'issue' : 'issues'} overdue`, STATUS.overdue],
    [summary.dependenciesAtRisk?.length, n => `${n} ${n === 1 ? 'dependency' : 'dependencies'} at risk`, STATUS.caution],
    [summary.assumptionsDue?.length, n => `${n} ${n === 1 ? 'assumption' : 'assumptions'} past validate-by`, STATUS.caution],
    [summary.reviewsDue?.length, n => `${n} risk ${n === 1 ? 'review' : 'reviews'} due`, STATUS.caution]
  ].filter(([n]) => n > 0)
  if (!bits.length) return <p className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{summary.open ? 'Nothing needs a look today.' : 'Nothing open.'}</p>
  return (
    <p className="text-[13.5px] leading-relaxed">
      {bits.map(([n, text, tone], k) => <span key={k}>{k > 0 && <span style={{ color: 'var(--ink-3)' }}>, </span>}<span style={{ color: tone }}>{text(n)}</span></span>)}
      <span style={{ color: 'var(--ink-3)' }}>.</span>
    </p>
  )
}

// ── the form, for adding and for editing ──────────────────────────────
const blank = type => ({
  type, title: '', owner: '', status: STATUSES[type][0], detail: '',
  likelihood: 3, impact: 3, mitigation: '', reviewOn: '',
  validateBy: '',
  severity: 'medium', due: '', resolution: '',
  on: '', needBy: '', direction: 'in',
  decidedOn: type === 'decision' ? localToday() : '', decidedBy: '', rationale: ''
})
const fromEntry = e => ({ ...blank(e.type), ...Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v ?? ''])) })
const FIELDS = {
  risk: ['likelihood', 'impact', 'mitigation', 'reviewOn'],
  assumption: ['validateBy'],
  issue: ['severity', 'due', 'resolution'],
  dependency: ['on', 'needBy', 'direction'],
  decision: ['decidedOn', 'decidedBy', 'rationale']
}
const bodyOf = f => {
  const out = { title: f.title, owner: f.owner, detail: f.detail }
  if (f.type !== 'decision') out.status = f.status
  for (const k of FIELDS[f.type]) out[k] = f[k] === '' ? null : f[k]
  return out
}

function Field({ label, children, wide = false, as = 'label' }) {
  const Tag = as
  return <Tag className={`block ${wide ? 'sm:col-span-2 lg:col-span-4' : ''}`}><span className={LABEL} style={{ color: 'var(--ink-3)' }}>{label}</span><span className="mt-1 block">{children}</span></Tag>
}

function TypePicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Type" className="flex flex-wrap items-center gap-1">
      {TYPES.map(t => {
        const Icon = TYPE[t].icon
        const on = value === t
        return (
          <button key={t} type="button" role="radio" aria-checked={on} onClick={() => onChange(t)}
            className={btn + ' btn-ghost'} style={on ? { background: 'var(--wash-2)', color: 'var(--ink)' } : undefined}>
            <Icon size={13} weight="bold" />{TYPE[t].one}
          </button>
        )
      })}
    </div>
  )
}

function EntryForm({ initial, adding = false, listId, onSave, onCancel, onDelete, busy }) {
  const [f, setF] = useState(initial)
  const [noTitle, setNoTitle] = useState(false)
  const titleRef = useRef(null)
  const msgId = useId()
  const set = (k, v) => { setF(s => ({ ...s, [k]: v })); if (k === 'title') setNoTitle(false) }
  const setType = t => setF(s => ({ ...blank(t), title: s.title, owner: s.owner, detail: s.detail }))
  const t = f.type
  const score = (Number(f.likelihood) || 0) * (Number(f.impact) || 0)
  const level = riskLevel(score)
  const submit = e => {
    e.preventDefault()
    if (busy) return
    if (!String(f.title).trim()) { setNoTitle(true); titleRef.current?.focus(); return }
    onSave(bodyOf(f), f.type)
  }
  return (
    <form onSubmit={submit} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() } }}
      aria-label={adding ? 'Add to the log' : `Edit ${TYPE[t].one.toLowerCase()}`} className="grid gap-3 py-3 sm:grid-cols-2 lg:grid-cols-4">
      {adding && <div className="sm:col-span-2 lg:col-span-4"><TypePicker value={t} onChange={setType} /></div>}
      <Field label="Title" wide>
        <input ref={titleRef} autoFocus value={f.title} onChange={e => set('title', e.target.value)} maxLength={160} className={INP}
          placeholder={{ risk: 'What could go wrong', assumption: 'What we take as true', issue: 'What went wrong', dependency: 'What we need, or owe', decision: 'What was decided' }[t]}
          aria-invalid={noTitle || undefined} aria-describedby={noTitle ? msgId : undefined} />
        {noTitle && <span id={msgId} role="alert" className="mt-1 block text-[12.5px]" style={{ color: 'var(--caution)' }}>Give it a title first.</span>}
      </Field>
      {t !== 'decision' && <Field label="Owner"><input list={listId} autoComplete="off" value={f.owner} onChange={e => set('owner', e.target.value)} maxLength={80} className={INP} placeholder="Who looks after it" /></Field>}
      {t !== 'decision' && <Field label="Status">
        <select value={f.status} onChange={e => set('status', e.target.value)} className={INP + ' cursor-pointer'}>{STATUSES[t].map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></Field>}

      {t === 'risk' && <>
        <Field label="Likelihood"><select value={f.likelihood} onChange={e => set('likelihood', Number(e.target.value))} className={INP + ' cursor-pointer'}>{LIKELIHOOD.map((w, n) => <option key={w} value={n + 1}>{n + 1}, {w}</option>)}</select></Field>
        <Field label="Impact"><select value={f.impact} onChange={e => set('impact', Number(e.target.value))} className={INP + ' cursor-pointer'}>{IMPACT.map((w, n) => <option key={w} value={n + 1}>{n + 1}, {w}</option>)}</select></Field>
        <Field as="div" label="Score"><span className="tnum flex min-h-[38px] items-center gap-2 text-[14px]" aria-live="polite">{score}<Chip tone={LEVEL_TONE[level]}>{level}</Chip></span></Field>
        <Field as="div" label="Review on"><DateField value={f.reviewOn || ''} onChange={v => set('reviewOn', v)} placeholder="Pick a day" /></Field>
        <Field label="Mitigation" wide><textarea rows={2} value={f.mitigation} onChange={e => set('mitigation', e.target.value)} maxLength={1000} className={INP + ' resize-y'} placeholder="What lowers the likelihood or the impact" /></Field>
      </>}
      {t === 'assumption' && <Field as="div" label="Validate by"><DateField value={f.validateBy || ''} onChange={v => set('validateBy', v)} placeholder="Pick a day" /></Field>}
      {t === 'issue' && <>
        <Field label="Severity"><select value={f.severity} onChange={e => set('severity', e.target.value)} className={INP + ' cursor-pointer'}>{['low', 'medium', 'high'].map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></Field>
        <Field as="div" label="Due"><DateField value={f.due || ''} onChange={v => set('due', v)} placeholder="Pick a day" /></Field>
        <Field label="Resolution" wide><textarea rows={2} value={f.resolution} onChange={e => set('resolution', e.target.value)} maxLength={1000} className={INP + ' resize-y'} placeholder="What fixed it, once it is fixed" /></Field>
      </>}
      {t === 'dependency' && <>
        <Field label="On whom or what"><input list={listId} autoComplete="off" value={f.on} onChange={e => set('on', e.target.value)} maxLength={120} className={INP} placeholder="Workshop, a supplier, a team" /></Field>
        <Field label="Direction"><select value={f.direction} onChange={e => set('direction', e.target.value)} className={INP + ' cursor-pointer'}><option value="in">We wait for them</option><option value="out">They wait for us</option></select></Field>
        <Field as="div" label="Need by"><DateField value={f.needBy || ''} onChange={v => set('needBy', v)} placeholder="Pick a day" /></Field>
      </>}
      {t === 'decision' && <>
        <Field as="div" label="Decided on"><DateField value={f.decidedOn || ''} onChange={v => set('decidedOn', v)} placeholder="Pick a day" /></Field>
        <Field label="Decided by"><input list={listId} autoComplete="off" value={f.decidedBy} onChange={e => set('decidedBy', e.target.value)} maxLength={80} className={INP} placeholder="Who made the call" /></Field>
        <Field label="Why" wide><textarea rows={2} value={f.rationale} onChange={e => set('rationale', e.target.value)} maxLength={1000} className={INP + ' resize-y'} placeholder="The reason, so nobody asks again" /></Field>
      </>}
      <Field label="Detail" wide><textarea rows={2} value={f.detail} onChange={e => set('detail', e.target.value)} maxLength={2000} className={INP + ' resize-y'} placeholder="Anything else worth knowing" /></Field>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" disabled={busy} aria-busy={busy || undefined} className={primary}>{adding ? `Add ${TYPE[t].one.toLowerCase()}` : 'Save'}</button>
        <button type="button" onClick={onCancel} className={ghost}>Cancel</button>
        {onDelete && <button type="button" onClick={onDelete} className={ghost + ' ml-auto'}><Trash size={13} weight="bold" /> Delete</button>}
      </div>
    </form>
  )
}

// ── a line of the log ─────────────────────────────────────────────────
function Row({ e, today, open, onToggle, children }) {
  const T = TYPE[e.type]
  const Icon = T.icon
  const closed = !isOpen(e) && e.type !== 'decision'
  const late = isLate(e, today)
  const d = keyDate(e)
  const level = e.type === 'risk' ? riskLevel(e.score) : null
  const panelId = useId()
  const fromLog = e.source === 'logbook'
  const meta = (
    <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[13px]">
      {e.type === 'risk' && <Chip tone={closed ? null : LEVEL_TONE[level]}>{e.score} {level}</Chip>}
      {e.type === 'issue' && e.severity && <Chip tone={!closed && e.severity === 'high' ? STATUS.overdue : null}>{e.severity}</Chip>}
      {e.type !== 'decision' && <Chip tone={STATUS_TONE[e.status] || null}>{e.status}</Chip>}
      {e.type === 'dependency' && e.on && <span className="tag" style={{ color: 'var(--ink-3)' }}>{e.direction === 'out' ? 'for' : 'on'} {e.on}</span>}
      {(e.owner || e.decidedBy) && <span className="tag" style={{ color: 'var(--ink-3)' }}>{e.owner || e.decidedBy}</span>}
      {d && <span className="tnum whitespace-nowrap" style={{ color: late ? STATUS.overdue : 'var(--ink-3)' }}>{T.datePrefix ? `${T.datePrefix} ` : ''}{fmtDate(d)}</span>}
    </span>
  )
  const head = (
    <>
      <span className="flex w-[124px] shrink-0 items-center gap-1.5 text-[12.5px]" style={{ color: 'var(--ink-3)' }}><Icon size={14} weight="bold" aria-hidden="true" />{T.one}</span>
      <span className="min-w-[180px] flex-1 text-[14px] leading-snug" style={{ color: closed ? 'var(--ink-3)' : 'var(--ink)' }}>{e.title}</span>
      {meta}
    </>
  )
  if (fromLog) {
    return (
      <li className="rule flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
        {head}
        <span className="w-[13px] shrink-0" aria-hidden="true" />
        <span className="flex w-full items-center gap-2 pl-[140px] text-[12.5px] max-sm:pl-0" style={{ color: 'var(--ink-3)' }}>
          From the Logbook:
          <a href={`#/logbook?entry=${encodeURIComponent(e.entryId)}`} className="inline-flex min-h-[24px] items-center gap-1 underline-offset-2 hover:underline" style={{ color: 'var(--ink-2)' }}>{e.entryTitle || 'the entry'}<ArrowSquareOut size={11} weight="bold" aria-hidden="true" /></a>
        </span>
      </li>
    )
  }
  return (
    <li className="rule transition-colors hover:[border-top-color:var(--line-2)]" style={open ? { borderTopColor: 'var(--line-2)' } : undefined}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={open ? panelId : undefined}
        className="group flex w-full flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-left">
        {head}
        <CaretDown size={13} weight="bold" aria-hidden="true" className="shrink-0 text-[var(--ink-3)] transition-[transform,color] group-hover:text-[var(--ink)]" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && <div id={panelId}>{children}</div>}
    </li>
  )
}

// ── the log ───────────────────────────────────────────────────────────
export default function RaiddLog({ projectKey, people = [], bare = false }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [filter, setFilter] = useState('all')
  const [cell, setCell] = useState(null)
  const [sort, setSort] = useState(() => { try { const s = localStorage.getItem(SORT_KEY); return SORTS[s] ? s : 'severity' } catch { return 'severity' } })
  const [openId, setOpenId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const [busy, setBusy] = useState(false)
  const listId = useId()
  const addRef = useRef(null)
  const today = localToday()

  const load = useCallback(() => {
    if (!projectKey) return Promise.resolve()
    return getRaidd(projectKey).then(d => { setData(d); setErr(null) }).catch(e => setErr(e.message))
  }, [projectKey])
  useEffect(() => { setData(null); setOpenId(null); setAdding(false); setCell(null); setFilter('all') }, [projectKey])
  useEffect(() => { load(); addEventListener('bench:refresh', load); return () => removeEventListener('bench:refresh', load) }, [load])

  const entries = useMemo(() => data?.entries || [], [data])
  const owners = useMemo(() => [...new Set([...people, ...entries.map(e => e.owner), ...entries.map(e => e.decidedBy)].map(s => String(s || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [people, entries])
  const shown = useMemo(() => {
    const cellIds = cell ? new Set(data?.matrix?.[cell.l - 1]?.[cell.i - 1] || []) : null
    return entries.filter(e => (filter === 'all' || e.type === filter) && (!cellIds || cellIds.has(e.id))).slice().sort(SORTS[sort].fn(today))
  }, [entries, filter, cell, sort, data, today])
  const openOnes = shown.filter(e => isOpen(e) || e.type === 'decision')
  const closedOnes = shown.filter(e => !isOpen(e) && e.type !== 'decision')

  if (!projectKey) return null
  if (err && !data) return <LoadFailed title="The RAIDD log did not load." message={`${err}. Try again asks once more.`} onRetry={load} />
  if (!data) return <PanelSkeleton rows={5} />

  const s = data.summary
  const total = TYPES.reduce((n, t) => n + (t === 'decision' ? s.counts[t].total : s.counts[t].open), 0)
  const chooseSort = v => { setSort(v); try { localStorage.setItem(SORT_KEY, v) } catch { /* the order is a convenience */ } }
  const chooseFilter = k => { setFilter(k); setCell(null) }
  const chooseCell = c => { setCell(c); if (c) setFilter('risk') }

  const add = async (body, type) => {
    setBusy(true)
    try {
      const e = await createRaidd({ ...body, type, project: projectKey })
      setAdding(false)
      await load()
      toast(`${TYPE[type].one} added.`, e.title)
      setTimeout(() => addRef.current?.focus({ preventScroll: true }), 0)
    } catch (x) { toast('That did not save.', x.message) } finally { setBusy(false) }
  }
  const save = async (e, body) => {
    setBusy(true)
    try { await patchRaidd(e.id, body); setOpenId(null); await load() }
    catch (x) { toast('That did not save.', x.message) } finally { setBusy(false) }
  }
  const remove = async e => {
    if (!await ask(`Delete the ${TYPE[e.type].one.toLowerCase()} "${e.title}"? The rest of the log stays.`, { yes: 'Delete' })) return
    try {
      const r = await removeRaidd(e.id)
      setOpenId(null); await load()
      toast('Removed.', e.title, async () => { await createRaidd(r.entry || e); await load() })
    } catch (x) { toast('That did not delete.', x.message) }
  }

  const emptyText = entries.length === 0
    ? 'Start the log with Add: a risk, an assumption, an issue, a dependency or a decision.'
    : cell ? 'No open risks in that cell; choose another or show all.'
      : filter === 'all' ? 'Nothing open; Add records the next one.'
        : filter === 'decision' ? 'No decisions yet; Add records one, or write it in a Logbook entry that names the project.'
          : `No open ${TYPE[filter].many.toLowerCase()}; Add records the next one.`

  const body = (
    <>
      <div className="flex flex-wrap items-stretch gap-x-10 gap-y-5">
        <div className="flex min-w-[300px] flex-1 flex-col">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="display text-[22px] font-semibold leading-none">RAIDD log.</h2>
            <span className="tnum text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{s.open} open</span>
          </div>
          <div className="mt-2"><Attention summary={s} /></div>
          <div className="mt-4"><Counters counts={s.counts} filter={filter} onFilter={chooseFilter} total={total} /></div>
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
            {!adding && <button ref={addRef} type="button" onClick={() => { setAdding(true); setOpenId(null) }} className={quiet}><Plus size={13} weight="bold" /> Add</button>}
            {cell && <button type="button" onClick={() => setCell(null)} className={ghost} aria-label="Show every risk again">Likelihood {cell.l}, impact {cell.i}<X size={12} weight="bold" aria-hidden="true" /></button>}
            <label className="ml-auto flex items-center gap-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>Sort
              <select value={sort} onChange={e => chooseSort(e.target.value)} className="field min-h-[32px] cursor-pointer px-2 py-1 text-[13px]">
                {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
          </div>
        </div>
        <HeatMap grid={data.matrix} cell={cell} onCell={chooseCell} />
      </div>

      {adding && (
        <div className="mt-2 rule">
          <EntryForm initial={blank(filter !== 'all' ? filter : 'risk')} adding listId={listId} busy={busy}
            onSave={add} onCancel={() => { setAdding(false); setTimeout(() => addRef.current?.focus({ preventScroll: true }), 0) }} />
        </div>
      )}

      <ul className="mt-3 flex flex-col" aria-label="Entries">
        {openOnes.map(e => (
          <Row key={e.id} e={e} today={today} open={openId === e.id} onToggle={() => { setOpenId(id => id === e.id ? null : e.id); setAdding(false) }}>
            <EntryForm initial={fromEntry(e)} listId={listId} busy={busy}
              onSave={b => save(e, b)} onCancel={() => setOpenId(null)} onDelete={() => remove(e)} />
          </Row>
        ))}
        {showClosed && closedOnes.map(e => (
          <Row key={e.id} e={e} today={today} open={openId === e.id} onToggle={() => { setOpenId(id => id === e.id ? null : e.id); setAdding(false) }}>
            <EntryForm initial={fromEntry(e)} listId={listId} busy={busy}
              onSave={b => save(e, b)} onCancel={() => setOpenId(null)} onDelete={() => remove(e)} />
          </Row>
        ))}
      </ul>
      {openOnes.length === 0 && !(showClosed && closedOnes.length) && <p className="rule pt-3 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{emptyText}</p>}
      {closedOnes.length > 0 && (
        <button type="button" onClick={() => setShowClosed(v => !v)} aria-expanded={showClosed} className={ghost + ' mt-2 -ml-3'}>
          {showClosed ? 'Hide closed' : `Show ${closedOnes.length} closed`}
        </button>
      )}
      <datalist id={listId}>{owners.map(o => <option key={o} value={o} />)}</datalist>
    </>
  )
  if (bare) return <div aria-label="RAIDD log">{body}</div>
  return <section className="panel p-6 sm:p-7" aria-label="RAIDD log">{body}</section>
}
