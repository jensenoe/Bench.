import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowUp, ArrowDown, X, Plus } from '@phosphor-icons/react'
import { getRaci, saveRaci, resetRaci } from '../api/raci.js'
import { check, nextLetter, typeLetter, fold, LABEL, MAX_PEOPLE, MAX_ROWS } from '../../server/raci-rules.js'
import { ask } from './Confirm.jsx'
import { PanelSkeleton } from './Skeleton.jsx'
import LoadFailed from './LoadFailed.jsx'
import { fmtDate } from '../lanes.js'

/**
 * Who does what on a project (roadmap 169): a RACI matrix with the activities down the side and the
 * people across the top. One per project key: an I-code ("I-1050") or "plan:<id>". Mounted as a tab on
 * the innovation project and on a plan.
 *
 * A cell steps through empty, R, A, AR, C, I on a click or Enter; R, A, C and I type a letter, Backspace
 * clears, the arrows move (a roving tab stop, role=grid). Each row wants one A and at least one R; the row
 * says so when it has none, or two. Every change saves 600 ms after the last one. The rules live in
 * server/raci-rules.js, so the row markers here and the PDF report agree.
 */
const SAVE_MS = 600
const ROTATE_AFTER = 8   // more people than this: names stand up, columns get narrow
const btn = 'pill inline-flex min-h-[32px] items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-50'
const quiet = btn + ' btn-quiet', ghost = btn + ' btn-ghost'
const iconBtn = 'pill btn-ghost inline-flex h-7 w-7 shrink-0 items-center justify-center'
const toast = (text, by) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true } }))
const tidy = v => String(v ?? '').replace(/\s+/g, ' ').trim()
const newId = () => `row-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`

/** A is the one with weight: the accent at a low wash. R is strong ink, C quieter, I quietest. */
const LOOK = {
  A: { background: 'color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--ink)', fontWeight: 600 },
  AR: { background: 'color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--ink)', fontWeight: 600 },
  R: { color: 'var(--ink)', fontWeight: 600 },
  C: { color: 'var(--ink-2)', fontWeight: 500 },
  I: { color: 'var(--ink-3)', fontWeight: 500 }   // a lone stroke: 400 thins out to a hairline on paper
}
function Letter({ letter }) {
  return <span className="tnum inline-flex h-6 min-w-[28px] items-center justify-center rounded-[4px] px-1.5 text-[13px] leading-none" style={LOOK[letter]}>{letter}</span>
}

function Legend({ id }) {
  return (
    <div id={id} className="mt-3 space-y-1.5">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]" style={{ color: 'var(--ink-2)' }}>
        <span className="inline-flex items-center gap-1.5"><Letter letter="R" /> does the work.</span>
        <span className="inline-flex items-center gap-1.5"><Letter letter="A" /> owns the outcome, one per row.</span>
        <span className="inline-flex items-center gap-1.5"><Letter letter="C" /> is asked before.</span>
        <span className="inline-flex items-center gap-1.5"><Letter letter="I" /> is told after.</span>
      </p>
      <p className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Click a cell to step through the letters, or type R, A, C or I. Arrows move, Backspace clears.</p>
    </div>
  )
}

/**
 * "Jacob" over "Meier", or the whole name standing up when the team is wide. `hintLine`: some column has a
 * hint, so every column keeps the line for one and the names stay on one baseline.
 */
function PersonHeader({ name, hints, rotated, hintLine, arrange, onRemove }) {
  const [first, ...rest] = name.split(' ')
  const hintId = useId()
  const hint = hints[0]
  return (
    <th scope="col" title={name} aria-describedby={hint ? hintId : undefined}
      className={`px-1 pb-2.5 align-bottom font-normal ${rotated ? 'w-12 min-w-12 max-w-12' : 'w-[92px] min-w-[92px] max-w-[92px]'}`}>
      {rotated ? (
        <span className="mx-auto block truncate text-[13px] font-medium" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxHeight: 132, color: 'var(--ink)' }}>{name}</span>
      ) : (
        <>
          <span className="block truncate text-center text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{first}</span>
          <span className="block h-[18px] truncate text-center text-[12px]" style={{ color: 'var(--ink-3)' }}>{rest.join(' ')}</span>
        </>
      )}
      {rotated
        ? hint && <span aria-hidden="true" title={hint.text} className="mx-auto mt-1.5 block h-1.5 w-1.5 rounded-full" style={{ background: hint.code === 'unused' ? 'var(--caution)' : 'var(--ink-3)' }} />
        : hintLine && <span aria-hidden="true" title={hint?.text} className="mt-0.5 block h-[18px] truncate text-center text-[12px]" style={{ color: hint?.code === 'unused' ? 'var(--caution)' : 'var(--ink-3)' }}>{hint?.short}</span>}
      {hint && <span id={hintId} className="sr-only">{hint.text}</span>}
      {arrange && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} title={`Remove ${name}`} className={`${iconBtn} mx-auto mt-1.5`}>
          <X size={14} weight="bold" />
        </button>
      )}
    </th>
  )
}

/** The name of an activity while it is being renamed. Enter or leaving the field keeps it, Escape does not. */
function RenameField({ value, label, onDone, onCancel }) {
  const [v, setV] = useState(value)
  const ref = useRef(null)
  const done = useRef(false)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  // byKey: Enter or Escape, so the focus goes back to the row; a click elsewhere leaves it where it went
  const commit = byKey => { if (done.current) return; done.current = true; onDone(v, byKey) }
  return (
    <input ref={ref} value={v} aria-label={label} maxLength={120} onChange={e => setV(e.target.value)} onBlur={() => commit(false)}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); commit(true) } else if (e.key === 'Escape') { e.preventDefault(); done.current = true; onCancel() }
      }}
      className="field h-8 w-full min-w-0 px-2.5 text-[13.5px]" />
  )
}

function RowHeader({ row, r, problems, showProblems, tabbable, arrange, renaming, first, last, onFocus, onKeyDown, onStartRename, onRename, onCancelRename, onMove, onRemove }) {
  const descId = useId()
  const shown = showProblems ? problems : []
  return (
    <th scope="row" role="rowheader" tabIndex={tabbable ? 0 : -1} data-rc={`${r}:0`} onFocus={onFocus} onKeyDown={onKeyDown}
      aria-describedby={shown.length ? descId : undefined}
      className="sticky left-0 z-10 w-[300px] min-w-[220px] max-w-[300px] p-0 text-left font-normal [outline-offset:-3px]"
      style={{ background: 'var(--panel)', borderTop: '1px solid var(--line)' }}>
      <div className="flex min-h-10 items-center gap-2 py-1 pl-1 pr-3">
        {renaming
          ? <RenameField value={row.activity} label={`Rename ${row.activity}`} onDone={onRename} onCancel={onCancelRename} />
          : <span onClick={onStartRename} title={`${row.activity}. Click to rename.`} className="min-w-0 flex-1 cursor-text truncate text-[13.5px]" style={{ color: 'var(--ink)' }}>{row.activity}</span>}
        {!renaming && !arrange && shown.map(p => (
          <span key={p.code} title={p.text} aria-hidden="true" className="shrink-0 whitespace-nowrap text-[12px] font-medium" style={{ color: p.code === 'noR' ? 'var(--caution)' : 'var(--late)' }}>{p.short}</span>
        ))}
        {shown.length > 0 && <span id={descId} className="sr-only">{shown.map(p => p.text).join(' ')}</span>}
        {arrange && !renaming && (
          <span className="flex shrink-0 items-center gap-0.5">
            <button type="button" data-focus={`up-${row.id}`} disabled={first} onClick={e => { e.stopPropagation(); onMove(-1) }} aria-label={`Move ${row.activity} up`} title="Move up" className={`${iconBtn} disabled:opacity-40`}><ArrowUp size={14} weight="bold" /></button>
            <button type="button" data-focus={`down-${row.id}`} disabled={last} onClick={e => { e.stopPropagation(); onMove(1) }} aria-label={`Move ${row.activity} down`} title="Move down" className={`${iconBtn} disabled:opacity-40`}><ArrowDown size={14} weight="bold" /></button>
            <button type="button" onClick={e => { e.stopPropagation(); onRemove() }} aria-label={`Remove ${row.activity}`} title="Remove" className={iconBtn}><X size={14} weight="bold" /></button>
          </span>
        )}
      </div>
    </th>
  )
}

function Cell({ r, c, letter, person, activity, tabbable, onFocus, onKeyDown, onClick }) {
  return (
    <td role="gridcell" tabIndex={tabbable ? 0 : -1} data-rc={`${r}:${c}`} aria-label={`${person}, ${activity}: ${LABEL[letter] || 'no letter'}`}
      onFocus={onFocus} onKeyDown={onKeyDown} onClick={onClick}
      className="cursor-pointer select-none p-0 text-center transition-colors hover:bg-[var(--wash)] [outline-offset:-3px]"
      style={{ borderTop: '1px solid var(--line)' }}>
      <span className="flex h-10 items-center justify-center">
        {letter ? <Letter letter={letter} /> : <span aria-hidden="true" className="block h-1 w-1 rounded-full" style={{ background: 'var(--line-2)' }} />}
      </span>
    </td>
  )
}

/** One line field with an Add button; Enter adds. Keeps its text when the add is refused. */
function AddField({ label, placeholder, list, disabled, onAdd, width = 'w-[220px]' }) {
  const [v, setV] = useState('')
  const id = useId()
  const submit = e => { e.preventDefault(); if (onAdd(v)) setV('') }
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">{label}</label>
      <input id={id} value={v} onChange={e => setV(e.target.value)} list={list} placeholder={placeholder} disabled={disabled} maxLength={120}
        autoComplete="off" className={`field h-9 min-w-0 px-3 text-[13.5px] ${width}`} />
      <button type="submit" disabled={disabled || !tidy(v)} className={quiet}><Plus size={14} weight="bold" />Add</button>
    </form>
  )
}

function Suggestions({ names, onAdd, label }) {
  if (!names.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>{label}</span>
      {names.map(n => (
        <button key={n} type="button" onClick={() => onAdd(n)} className={`${ghost} min-h-[28px] px-2.5 py-1`} aria-label={`Add ${n}`}>
          <Plus size={13} weight="bold" />{n}
        </button>
      ))}
    </div>
  )
}

const STATUS_TEXT = {
  start: 'Starting rows. Nothing is kept until you change something.',
  pending: 'Saving.',
  saving: 'Saving.',
  saved: 'Saved.',
  failed: 'Not saved. The next change tries again.'
}

export default function RaciMatrix({ projectKey }) {
  const [m, setM] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [err, setErr] = useState(null)
  const [status, setStatus] = useState('start')
  const [arrange, setArrange] = useState(false)
  const [focus, setFocus] = useState({ r: 0, c: 1 })
  const [renaming, setRenaming] = useState(null)
  const [note, setNote] = useState(null)
  const [said, setSaid] = useState('')
  const [tick, setTick] = useState(0)
  const latest = useRef(null)      // the matrix as the screen shows it, for the save
  const ver = useRef(0)            // bumps on every change; a save that comes back late does not undo newer ones
  const timer = useRef(null)
  const keyRef = useRef(projectKey)
  const grid = useRef(null)
  const refocus = useRef(null)     // a [data-focus] or [data-rc] to focus after the next render
  const legendId = useId(), listId = useId()

  const flush = useCallback(async () => {
    clearTimeout(timer.current); timer.current = null
    const v = ver.current, key = keyRef.current, body = latest.current
    if (!body) return
    setStatus('saving')
    try {
      const r = await saveRaci(key, body)
      if (keyRef.current !== key) return
      setSuggestions(r.suggestions || [])
      if (ver.current === v) { latest.current = r.matrix; setM(r.matrix); setStatus('saved') }
    } catch (e) {
      if (keyRef.current !== key) return
      setStatus('failed')
      toast('The RACI matrix did not save.', e.message)
    }
  }, [])

  useEffect(() => {
    keyRef.current = projectKey
    let live = true
    setM(null); setErr(null); setRenaming(null); setNote(null); setFocus({ r: 0, c: 1 })
    getRaci(projectKey).then(r => {
      if (!live) return
      latest.current = r.matrix; setM(r.matrix); setSuggestions(r.suggestions || [])
      setStatus(r.matrix.updatedAt ? 'stored' : 'start')
    }).catch(e => live && setErr(e.message))
    return () => {
      live = false
      if (timer.current) {   // leaving with a change not yet sent: send it now
        clearTimeout(timer.current); timer.current = null
        const body = latest.current
        saveRaci(projectKey, body).catch(e => toast('The RACI matrix did not save.', e.message))
      }
    }
  }, [projectKey, tick])

  useEffect(() => {
    if (!refocus.current || !grid.current) return
    const el = grid.current.querySelector(refocus.current)
    refocus.current = null
    el?.focus()
  })

  const change = useCallback(fn => {
    const next = fn(latest.current)
    latest.current = next; ver.current++
    setM(next); setStatus('pending')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_MS)
  }, [flush])

  const problems = useMemo(() => m ? check(m) : null, [m])

  if (err && !m) return <LoadFailed title="The RACI matrix did not load." message={`${err}. Try again asks once more.`} onRetry={() => setTick(t => t + 1)} />
  if (!m) return <PanelSkeleton rows={6} />

  const { people, rows } = m
  const rotated = people.length > ROTATE_AFTER
  const at = { r: Math.min(focus.r, rows.length - 1), c: Math.min(focus.c, people.length) }
  const offered = suggestions.filter(s => !people.some(p => fold(p) === fold(s)))
  const settled = rows.filter(row => !(problems.rows[row.id] || []).length).length

  const setCell = (row, person, letter) => {
    change(x => {
      const cells = { ...x.cells }, mine = { ...(cells[row.id] || {}) }
      if (letter) mine[person] = letter; else delete mine[person]
      if (Object.keys(mine).length) cells[row.id] = mine; else delete cells[row.id]
      return { ...x, cells }
    })
    setSaid(`${person}, ${row.activity}: ${LABEL[letter] || 'no letter'}`)
  }
  const moveTo = (r, c) => {
    setFocus({ r, c })
    grid.current?.querySelector(`[data-rc="${r}:${c}"]`)?.focus()
  }
  const onKey = (e, r, c) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const last = { r: rows.length - 1, c: people.length }
    const go = {
      ArrowUp: [Math.max(0, r - 1), c], ArrowDown: [Math.min(last.r, r + 1), c],
      ArrowLeft: [r, Math.max(0, c - 1)], ArrowRight: [r, Math.min(last.c, c + 1)],
      Home: [r, 0], End: [r, last.c]
    }[e.key]
    if (go) { e.preventDefault(); e.stopPropagation(); moveTo(...go); return }
    const row = rows[r]
    if (c === 0) {
      if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); e.stopPropagation(); setRenaming(row.id) }
      return
    }
    const person = people[c - 1], cur = m.cells[row.id]?.[person] || ''
    const k = e.key.length === 1 ? e.key.toUpperCase() : e.key
    let next = null
    if (['R', 'A', 'C', 'I'].includes(k)) next = typeLetter(cur, k)
    else if (k === 'Backspace' || k === 'Delete') next = ''
    else if (k === 'Enter' || k === ' ') next = nextLetter(cur)
    if (next === null) return
    e.preventDefault(); e.stopPropagation()
    setCell(row, person, next)
  }

  const addPerson = name => {
    const n = tidy(name).slice(0, 60)
    if (!n) return false
    if (people.length >= MAX_PEOPLE) { setNote('Sixteen people is the most one matrix holds.'); return false }
    const there = people.find(p => fold(p) === fold(n))
    if (there) { setNote(`${there} is on the matrix already.`); return false }
    setNote(null)
    change(x => ({ ...x, people: [...x.people, n] }))
    return true
  }
  const addRow = text => {
    const a = tidy(text).slice(0, 120)
    if (!a) return false
    if (rows.length >= MAX_ROWS) { setNote('Forty activities is the most one matrix holds.'); return false }
    setNote(null)
    change(x => ({ ...x, rows: [...x.rows, { id: newId(), activity: a }] }))
    return true
  }
  const rename = (row, text, byKey) => {
    const a = tidy(text).slice(0, 120)
    setRenaming(null)
    if (byKey) refocus.current = `[data-rc="${rows.indexOf(row)}:0"]`
    if (a && a !== row.activity) change(x => ({ ...x, rows: x.rows.map(y => y.id === row.id ? { ...y, activity: a } : y) }))
  }
  const moveRow = (row, d) => {
    change(x => {
      const i = x.rows.findIndex(y => y.id === row.id), j = i + d
      if (i < 0 || j < 0 || j >= x.rows.length) return x
      const next = x.rows.slice();[next[i], next[j]] = [next[j], next[i]]
      return { ...x, rows: next }
    })
    const i = rows.indexOf(row) + d
    refocus.current = i <= 0 ? `[data-focus="down-${row.id}"]` : i >= rows.length - 1 ? `[data-focus="up-${row.id}"]` : `[data-focus="${d < 0 ? 'up' : 'down'}-${row.id}"]`
  }
  const removeRow = async row => {
    if (!(await ask(`Remove "${row.activity}"? Its letters go; the people and the other rows stay.`, { yes: 'Remove' }))) return
    const i = rows.indexOf(row)
    change(x => { const cells = { ...x.cells }; delete cells[row.id]; return { ...x, rows: x.rows.filter(y => y.id !== row.id), cells } })
    refocus.current = rows.length > 1 ? `[data-rc="${Math.min(i, rows.length - 2)}:0"]` : null
  }
  const removePerson = async name => {
    if (!(await ask(`Remove ${name}? Their letters on every row go; the activities stay.`, { yes: 'Remove' }))) return
    change(x => ({
      ...x, people: x.people.filter(p => p !== name),
      cells: Object.fromEntries(Object.entries(x.cells).map(([id, c]) => { const { [name]: _gone, ...rest } = c; return [id, rest] }).filter(([, c]) => Object.keys(c).length))
    }))
    refocus.current = `[data-rc="${at.r}:0"]`
  }
  const reset = async () => {
    if (!(await ask('Reset the matrix to its starting rows? The people and every letter go.', { yes: 'Reset' }))) return
    clearTimeout(timer.current); timer.current = null; ver.current++
    try {
      const r = await resetRaci(projectKey)
      latest.current = r.matrix; setM(r.matrix); setSuggestions(r.suggestions || []); setStatus('start'); setArrange(false)
    } catch (e) { toast('The matrix did not reset.', e.message) }
  }

  const statusText = status === 'stored' ? `Saved ${fmtDate(m.updatedAt)}${m.by ? ` by ${m.by.split(' ')[0]}` : ''}.` : STATUS_TEXT[status]
  // a group's name above its first row; a row without one after grouped rows sits under "Other"
  const headings = []
  for (let i = 0, prev = ''; i < rows.length; i++) {
    const g = rows[i].group || (prev ? 'Other' : '')
    headings.push(g && g !== prev ? g : null)
    prev = g
  }
  const span = people.length ? people.length + 1 : 1
  const hintLine = people.some(p => (problems.people[p] || []).length)

  return (
    <section className="panel p-6 sm:p-7" aria-label="RACI matrix">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h2 className="display text-[22px] font-semibold leading-none">Who does what.</h2>
        <span className="tnum text-[13.5px]" style={{ color: 'var(--ink-3)' }}>
          {people.length && rows.length
            ? `${settled === rows.length ? `All ${plural(rows.length, 'row')}` : `${settled} of ${plural(rows.length, 'row')}`} settled, ${plural(people.length, 'person', 'people')}`
            : plural(rows.length, 'activity', 'activities')}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px]" style={{ color: status === 'failed' ? 'var(--caution)' : 'var(--ink-3)' }}>{statusText}</span>
          <span className="flex items-center gap-1">
            {status === 'failed' && <button type="button" onClick={flush} className={ghost}>Try again</button>}
            <button type="button" onClick={() => { setArrange(v => !v); setRenaming(null) }} aria-pressed={arrange} className={`${btn} btn-ghost`}
              style={arrange ? { background: 'var(--wash-2)', color: 'var(--ink)' } : undefined}>Arrange</button>
            {m.updatedAt && <button type="button" onClick={reset} className={ghost}>Reset</button>}
          </span>
        </div>
      </div>
      <Legend id={legendId} />

      <div className="relative mt-5 max-w-full overflow-x-auto pb-1">
        <table ref={grid} role="grid" aria-label={`RACI for ${projectKey}`} aria-describedby={legendId} className="border-separate border-spacing-0">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 px-1 pb-2.5 text-left align-bottom text-[13px] font-normal" style={{ background: 'var(--panel)' }}><span className="sr-only">Activity</span></th>
              {people.map(p => (
                <PersonHeader key={p} name={p} hints={problems.people[p] || []} rotated={rotated} hintLine={hintLine} arrange={arrange} onRemove={() => removePerson(p)} />
              ))}
              {!people.length && <th scope="col" className="pb-2.5 pl-6 text-left align-bottom text-[13px] font-normal" style={{ color: 'var(--ink-3)' }}>People</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              return [
                headings[r] && (
                  <tr key={`g-${row.id}`} aria-hidden="true">
                    <td colSpan={span} className={`px-1 pb-1.5 text-[12.5px] font-medium ${r ? 'pt-5' : 'pt-0'}`} style={{ color: 'var(--ink-3)' }}>{headings[r]}</td>
                  </tr>
                ),
                <tr key={row.id}>
                  <RowHeader row={row} r={r} problems={problems.rows[row.id] || []} showProblems={people.length > 0}
                    tabbable={at.r === r && at.c === 0} arrange={arrange} renaming={renaming === row.id} first={r === 0} last={r === rows.length - 1}
                    onFocus={() => setFocus({ r, c: 0 })} onKeyDown={e => onKey(e, r, 0)}
                    onStartRename={() => setRenaming(row.id)} onRename={(v, byKey) => rename(row, v, byKey)} onCancelRename={() => { setRenaming(null); refocus.current = `[data-rc="${r}:0"]` }}
                    onMove={d => moveRow(row, d)} onRemove={() => removeRow(row)} />
                  {people.map((p, i) => (
                    <Cell key={p} r={r} c={i + 1} letter={m.cells[row.id]?.[p] || ''} person={p} activity={row.activity}
                      tabbable={at.r === r && at.c === i + 1} onFocus={() => setFocus({ r, c: i + 1 })} onKeyDown={e => onKey(e, r, i + 1)}
                      onClick={() => setCell(row, p, nextLetter(m.cells[row.id]?.[p] || ''))} />
                  ))}
                  {!people.length && r === 0 && (
                    <td role="gridcell" rowSpan={rows.length + headings.filter((h, i) => h && i > 0).length} className="pl-6 align-top">
                      <div className="max-w-[46ch] pt-2">
                        <p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>Nobody is on the matrix yet. Add the people on this project, then give every activity one A.</p>
                        <div className="mt-3"><Suggestions names={offered.slice(0, 8)} onAdd={addPerson} label="From the project:" /></div>
                      </div>
                    </td>
                  )}
                </tr>
              ]
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap items-start gap-x-8 gap-y-3">
        <AddField label="Add person" placeholder="Add person" list={listId} disabled={people.length >= MAX_PEOPLE} onAdd={addPerson} />
        <datalist id={listId}>{offered.map(n => <option key={n} value={n} />)}</datalist>
        <AddField label="Add activity" placeholder="Add activity" disabled={rows.length >= MAX_ROWS} onAdd={addRow} width="w-[260px]" />
      </div>
      {note && <p role="status" className="mt-2 text-[13px]" style={{ color: 'var(--caution)' }}>{note}</p>}
      {people.length > 0 && people.length < MAX_PEOPLE && (
        <div className="mt-3"><Suggestions names={offered.slice(0, 6)} onAdd={addPerson} label="Also on the project:" /></div>
      )}
      <p className="sr-only" aria-live="polite">{said}</p>
    </section>
  )
}
