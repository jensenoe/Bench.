import { useCallback, useEffect, useState } from 'react'
import { ArrowCounterClockwise, CaretDown, CaretUp } from '@phosphor-icons/react'
import { getHistory, undoChange } from '../api/core.js'
import { LANES, fmtDate } from '../lanes.js'

/**
 * Recent changes (roadmap 87): who did what to which task, in words, with an Undo where one is possible.
 * Edits put the old values back, a delete comes back with its id, an add is deleted again. Sync entries
 * are shown but not undoable; that is the source tool's business. Collapsed by default; the header
 * always carries the latest line so the panel is useful closed.
 */
const KEY = 'bench.changes.open'
const FIELD_WORDS = { dueDate: 'due', orderBy: 'order by', orderedOn: 'ordered', deliveredOn: 'delivered', waitingOn: 'waiting on', assignedBy: 'assigned by', lead: 'lead', project: 'project', supplier: 'supplier', poNumber: 'PO', priority: 'priority', effortHours: 'effort', leadTimeDays: 'lead time', repeat: 'repeat' }
const DATE_FIELDS = new Set(['dueDate', 'orderBy', 'orderedOn', 'deliveredOn'])

export const ago = (iso, now = new Date()) => {
  const then = new Date(iso)
  const s = Math.max(0, (now - then) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  const day = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  if (day(then) === day(now)) return `${Math.round(s / 3600)} h ago`
  const y = new Date(now); y.setDate(y.getDate() - 1)
  if (day(then) === day(y)) return 'yesterday'
  const days = Math.round(s / 86400)
  if (days < 7) return `${days} days ago`
  return fmtDate(iso)
}

const words = (c) => {
  if (c.field === 'lane') return `moved to ${LANES[c.to]?.label || c.to}`
  if (c.field === 'done') return c.to ? 'ticked off' : 'reopened'
  if (c.field === 'title') return `renamed from "${c.from}"`
  if (c.field === 'notes') return 'edited the notes'
  if (c.field === 'checklist') return 'changed the checklist'
  if (c.field === 'tags') return 'changed the tags'
  if (c.field === 'links') return 'changed the links'
  if (DATE_FIELDS.has(c.field)) return c.to ? `${FIELD_WORDS[c.field]} ${fmtDate(c.to)}` : `${FIELD_WORDS[c.field]} cleared`
  const name = FIELD_WORDS[c.field] || c.field
  return c.to === null || c.to === '' ? `${name} cleared` : `${name} set to ${String(c.to)}`
}

/** One entry as a sentence: who, what, and the task in quotes. */
export const describe = (e) => {
  if (e.kind === 'created') return { who: e.who, what: 'added' }
  if (e.kind === 'deleted') return { who: e.who, what: 'deleted' }
  if (e.kind === 'synced') return { who: `${e.who} sync`, what: e.changes.some(c => c.field === 'done' && c.to) ? 'closed' : 'added' }
  const list = e.changes.map(words)
  return { who: e.who, what: list.length > 3 ? `${list.slice(0, 3).join(', ')} and ${list.length - 3} more` : list.join(', ') }
}
const undoable = (e) => !e.undoneAt && ['created', 'changed', 'deleted'].includes(e.kind)
const toast = (text) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by: 'changes', plain: true } }))

export default function Changes({ limit = 30 }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })
  const [entries, setEntries] = useState(null)
  const [busy, setBusy] = useState(null)
  const [now, setNow] = useState(() => new Date())

  const refresh = useCallback(() => { getHistory(limit).then(list => { setEntries(list); setNow(new Date()) }).catch(() => setEntries(e => e || [])) }, [limit])
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 60_000)
    window.addEventListener('bench:refresh', refresh)
    return () => { clearInterval(t); window.removeEventListener('bench:refresh', refresh) }
  }, [refresh])

  const toggle = () => { const v = !open; setOpen(v); try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* ignore */ } }
  const undo = async (e) => {
    setBusy(e.id)
    try {
      await undoChange(e.id)
      toast(e.kind === 'deleted' ? `"${e.title}" is back.` : e.kind === 'created' ? `"${e.title}" removed again.` : `Undone: ${describe(e).what} on "${e.title}".`)
      window.dispatchEvent(new Event('bench:refresh'))
      refresh()
    } catch (err) { toast(err.message) } finally { setBusy(null) }
  }

  const latest = entries?.[0]
  return (
    <section className="panel p-6 sm:p-7" aria-labelledby="changes-title">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="changes-title" className="display text-[22px] font-semibold leading-none">Recent changes.</h2>
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls="changes-list"
          className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px]" style={{ background: 'var(--row)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}>
          {open ? 'Hide' : entries?.length ? `Show ${entries.length}` : 'Show'}{open ? <CaretUp size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />}
        </button>
      </div>
      {!open && latest && (
        <p className="mt-2 truncate text-[13px]" style={{ color: 'var(--ink-3)' }} title={`${describe(latest).who} ${describe(latest).what} "${latest.title}"`}>
          {describe(latest).who} {describe(latest).what} "{latest.title}", {ago(latest.at, now)}.
        </p>
      )}
      {!open && entries && !entries.length && <p className="mt-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>Edits, moves and deletions land here, each with an Undo.</p>}

      {open && (
        <div id="changes-list">
          {entries && !entries.length && <p className="mt-3 text-[13px]" style={{ color: 'var(--ink-3)' }}>Nothing has changed yet. Edits, moves and deletions land here, each with an Undo.</p>}
          {entries && entries.length > 0 && (
            <ul className="mt-4 flex flex-col">
              {entries.map(e => {
                const d = describe(e)
                return (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5" style={{ borderTop: '1px solid var(--line)' }}>
                    <span className="min-w-0 flex-1 text-[13.5px] leading-snug" style={{ color: e.undoneAt ? 'var(--ink-3)' : 'var(--ink)' }}>
                      <span className="font-medium">{d.who}</span> {d.what} <span style={{ color: 'var(--ink-2)' }}>"{e.title}"</span>
                      {e.undoneAt && <span style={{ color: 'var(--ink-3)' }}>, undone</span>}
                    </span>
                    <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{ago(e.at, now)}</span>
                    {undoable(e) && (
                      <button type="button" onClick={() => undo(e)} disabled={busy === e.id} aria-label={`Undo: ${d.what} on ${e.title}`}
                        className="inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12.5px] disabled:opacity-50" style={{ background: 'var(--row)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}>
                        <ArrowCounterClockwise size={12} weight="bold" />Undo
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
