import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MagnifyingGlass, ArrowElbowDownLeft } from '@phosphor-icons/react'
import * as api from '../api.js'
import useFocusTrap from '../hooks/useFocusTrap.js'

/**
 * Ctrl-K. One box over everything: tasks, logbook entries, napkin nodes, pages, and actions (roadmap 86).
 * Arrow keys move, Enter opens or runs, Escape closes. Logbook and napkin content is fetched
 * when the box opens, so the board stays light the rest of the time.
 * Actions come in as [{ label, hint, run }]: a query that matches a label shows them in a group above the
 * rest; a query that starts with ">" shows actions only.
 * The field is a combobox over a listbox of options, so a screen reader hears the highlighted hit as the
 * arrows move it; the highlighted hit scrolls into view, Tab stays inside, and focus goes back on close.
 */
const KINDS = { action: 'Action', task: 'Task', entry: 'Logbook', node: 'Napkin', page: 'Page' }
const PAGES = [['', 'Home'], ['board', 'Board'], ['procurement', 'Procurement'], ['tools', 'Tools'], ['logbook', 'Logbook'], ['napkin', 'Napkin'], ['hours', 'Hours'], ['review', 'Review'], ['machines', 'Machines'], ['playbooks', 'Playbooks'], ['projects', 'Projects'], ['wall', 'Wall mode']]
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Search({ open, onClose, tasks = [], actions = [] }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const [extra, setExtra] = useState({ entries: [], maps: [] })
  const input = useRef(null)
  const box = useRef(null)
  useFocusTrap(box, open)

  useEffect(() => {
    if (!open) return
    setQ(''); setI(0)
    setTimeout(() => input.current?.focus(), 30)
    Promise.all([api.getLogbook().catch(() => []), api.getMaps().catch(() => [])]).then(([entries, maps]) => setExtra({ entries, maps }))
  }, [open])

  const commands = q.trimStart().startsWith('>')
  const results = useMemo(() => {
    const raw = q.trim()
    const t = norm(commands ? raw.slice(1).trim() : raw)
    if (!t && !commands) return []
    const words = t ? t.split(/\s+/) : []
    const hit = (s) => { const n = norm(s); return words.every(w => n.includes(w)) }
    const out = []
    for (const a of actions) if (a && a.label && (commands ? hit(`${a.label} ${a.hint || ''}`) : t && hit(a.label)))
      out.push({ kind: 'action', title: a.label, sub: a.hint, run: a.run, hash: `action:${a.label}` })
    if (commands) return out.slice(0, 40)
    for (const [id, label] of PAGES) if (hit(label)) out.push({ kind: 'page', title: label, hash: `#/${id}` })
    for (const x of tasks) if (hit([x.title, x.project, x.assignedBy, x.lead, (x.tags || []).join(' '), x.notes, x.supplier, x.poNumber, x.waitingOn, (x.checklist || []).map(c => c.text).join(' ')].join(' ')))
      out.push({ kind: 'task', title: x.title, sub: [x.done ? 'done' : x.lane, x.project, x.source && x.source !== 'local' ? x.source : null].filter(Boolean).join(', '), hash: `#/board?task=${x.id}`, id: x.id })
    for (const e of extra.entries) if (hit([e.title, e.project, e.notes, (e.attendees || []).join(' '), (e.decisions || []).join(' '), (e.actions || []).map(a => a.text).join(' ')].join(' ')))
      out.push({ kind: 'entry', title: e.title, sub: [e.date, e.project].filter(Boolean).join(', '), hash: `#/logbook?entry=${e.id}` })
    for (const m of extra.maps) for (const n of Object.values(m.nodes || {})) if (n.text && hit(n.text))
      out.push({ kind: 'node', title: n.text, sub: m.title, hash: `#/napkin?map=${m.id}` })
    return out.slice(0, 40)
  }, [q, commands, tasks, extra, actions])
  const actionCount = results.filter(r => r.kind === 'action').length

  useEffect(() => { setI(0) }, [q])
  // The arrows can walk past the bottom of the list; keep the highlighted hit on screen.
  useEffect(() => { if (open) document.getElementById(`search-hit-${i}`)?.scrollIntoView({ block: 'nearest' }) }, [i, open])
  const go = (r) => {
    if (!r) return
    onClose()
    // An action may answer later (a punch, a save); when it fails, say so instead of closing on nothing.
    if (r.kind === 'action') {
      Promise.resolve().then(() => r.run?.()).catch(err => {
        window.bench?.log?.(`action ${r.title}: ${err.message}`)
        window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text: 'That did not work.', by: `${r.title}: ${err.message}`, plain: true } }))
      })
      return
    }
    location.hash = r.hash
    if (r.kind === 'task') setTimeout(() => {
      const el = document.getElementById(`task-${r.id}`)
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); el.style.outline = '2px solid var(--accent)'; el.style.outlineOffset = '2px'; setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = '' }, 2200) }
    }, 450)
  }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(results.length - 1, x + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(0, x - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[i]) }
    else if (e.key === 'Escape') onClose()
  }
  const groupLabel = (text, key) => <p key={key} id={key} className="px-3 pb-1 pt-2 text-[12px] font-medium" style={{ color: 'var(--ink-3)' }}>{text}</p>

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="search" ref={box} role="dialog" aria-modal="true" aria-label="Search" className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .15 }}
          style={{ background: 'rgba(var(--page-veil),.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onMouseDown={onClose}>
          <motion.div initial={{ y: -10, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -6, scale: .98 }} transition={{ duration: .18, ease: [0.16, 1, 0.3, 1] }}
            className="panel w-full max-w-[640px] overflow-hidden" style={{ boxShadow: 'var(--shadow-panel)' }} onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
              <MagnifyingGlass size={16} style={{ color: 'var(--ink-3)' }} />
              <input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder={actions.length ? 'Search tasks, notes, maps, pages. Type > for actions' : 'Search tasks, notes, maps, pages'}
                aria-label="Search" role="combobox" aria-autocomplete="list" aria-expanded={results.length > 0} aria-controls={results.length ? 'search-results' : undefined}
                aria-activedescendant={results[i] ? `search-hit-${i}` : undefined}
                className="w-full bg-transparent text-[16px]" style={{ outline: 'none' }} />
              <span className="tnum hidden text-[12.5px] sm:inline" style={{ color: 'var(--ink-3)' }}>esc</span>
            </div>
            <div className="max-h-[52vh] overflow-y-auto p-2">
              {!q.trim() && <p className="px-3 py-6 text-center text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Type a word. Tasks, logbook entries, napkin nodes and pages{actions.length ? ', or > for an action' : ''}.</p>}
              {q.trim() && !results.length && <p className="px-3 py-6 text-center text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{commands ? 'No action by that name.' : 'Nothing matches.'}</p>}
              {results.length > 0 && (
                <div role="listbox" id="search-results" aria-label="Results">
                  {actionCount > 0
                    ? <>
                      <div role="group" aria-labelledby="search-g-actions">{groupLabel('Actions', 'search-g-actions')}{results.slice(0, actionCount).map((r, k) => <Hit key={r.hash + k} r={r} k={k} i={i} setI={setI} go={go} />)}</div>
                      {actionCount < results.length && <div role="group" aria-labelledby="search-g-results">{groupLabel('Results', 'search-g-results')}{results.slice(actionCount).map((r, k) => <Hit key={r.hash + k} r={r} k={k + actionCount} i={i} setI={setI} go={go} />)}</div>}
                    </>
                    : results.map((r, k) => <Hit key={r.hash + k} r={r} k={k} i={i} setI={setI} go={go} />)}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** One hit: an option in the listbox, clicked or reached with the arrows; never a Tab stop of its own. */
function Hit({ r, k, i, setI, go }) {
  return (
    <button id={`search-hit-${k}`} role="option" aria-selected={k === i} tabIndex={-1} onMouseEnter={() => setI(k)} onClick={() => go(r)} className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left"
      style={{ background: k === i ? 'var(--wash-2)' : 'transparent' }}>
      <span className="w-[62px] shrink-0 text-[12px] font-medium" style={{ color: r.kind === 'action' ? 'var(--accent)' : 'var(--ink-3)' }}>{KINDS[r.kind]}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px]">{r.title}</span>
        {r.sub && <span className="block truncate text-[13px]" style={{ color: 'var(--ink-3)' }}>{r.sub}</span>}
      </span>
      {k === i && <ArrowElbowDownLeft size={13} weight="bold" style={{ color: 'var(--ink-3)' }} />}
    </button>
  )
}
