import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MagnifyingGlass, ArrowElbowDownLeft } from '@phosphor-icons/react'
import * as api from '../api.js'

/**
 * Ctrl-K. One box over everything: tasks, logbook entries, napkin nodes, pages.
 * Arrow keys move, Enter opens, Escape closes. Logbook and napkin content is fetched
 * when the box opens, so the board stays light the rest of the time.
 */
const KINDS = { task: 'Task', entry: 'Logbook', node: 'Napkin', page: 'Page' }
const PAGES = [['', 'Home'], ['board', 'Board'], ['procurement', 'Procurement'], ['tools', 'Tools'], ['logbook', 'Logbook'], ['napkin', 'Napkin'], ['hours', 'Hours']]
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Search({ open, onClose, tasks = [] }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const [extra, setExtra] = useState({ entries: [], maps: [] })
  const input = useRef(null)

  useEffect(() => {
    if (!open) return
    setQ(''); setI(0)
    setTimeout(() => input.current?.focus(), 30)
    Promise.all([api.getLogbook().catch(() => []), api.getMaps().catch(() => [])]).then(([entries, maps]) => setExtra({ entries, maps }))
  }, [open])

  const results = useMemo(() => {
    const t = norm(q.trim())
    if (!t) return []
    const words = t.split(/\s+/)
    const hit = (s) => { const n = norm(s); return words.every(w => n.includes(w)) }
    const out = []
    for (const [id, label] of PAGES) if (hit(label)) out.push({ kind: 'page', title: label, hash: `#/${id}` })
    for (const x of tasks) if (hit([x.title, x.project, x.assignedBy, x.lead, (x.tags || []).join(' '), x.notes, x.supplier, x.poNumber, x.waitingOn, (x.checklist || []).map(c => c.text).join(' ')].join(' ')))
      out.push({ kind: 'task', title: x.title, sub: [x.done ? 'done' : x.lane, x.project, x.source && x.source !== 'local' ? x.source : null].filter(Boolean).join(', '), hash: `#/board?task=${x.id}`, id: x.id })
    for (const e of extra.entries) if (hit([e.title, e.project, e.notes, (e.attendees || []).join(' '), (e.decisions || []).join(' '), (e.actions || []).map(a => a.text).join(' ')].join(' ')))
      out.push({ kind: 'entry', title: e.title, sub: [e.date, e.project].filter(Boolean).join(', '), hash: `#/logbook?entry=${e.id}` })
    for (const m of extra.maps) for (const n of Object.values(m.nodes || {})) if (n.text && hit(n.text))
      out.push({ kind: 'node', title: n.text, sub: m.title, hash: `#/napkin?map=${m.id}` })
    return out.slice(0, 40)
  }, [q, tasks, extra])

  useEffect(() => { setI(0) }, [q])
  const go = (r) => {
    if (!r) return
    onClose()
    location.hash = r.hash
    if (r.kind === 'task') setTimeout(() => {
      const el = document.getElementById(`task-${r.id}`)
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.style.outline = '2px solid var(--accent)'; el.style.outlineOffset = '2px'; setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = '' }, 2200) }
    }, 450)
  }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(results.length - 1, x + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(0, x - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[i]) }
    else if (e.key === 'Escape') onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="search" className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .15 }}
          style={{ background: 'rgba(var(--page-veil),.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onMouseDown={onClose}>
          <motion.div initial={{ y: -10, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -6, scale: .98 }} transition={{ duration: .18, ease: [0.16, 1, 0.3, 1] }}
            className="panel w-full max-w-[640px] overflow-hidden" style={{ boxShadow: 'var(--shadow-panel)' }} onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
              <MagnifyingGlass size={16} style={{ color: 'var(--ink-3)' }} />
              <input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search tasks, notes, maps, pages"
                className="w-full bg-transparent text-[16px]" style={{ outline: 'none' }} />
              <span className="tnum hidden text-[12.5px] sm:inline" style={{ color: 'var(--ink-3)' }}>esc</span>
            </div>
            <div className="max-h-[52vh] overflow-y-auto p-2">
              {!q.trim() && <p className="px-3 py-6 text-center text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Type a word. Tasks, logbook entries, napkin nodes and pages.</p>}
              {q.trim() && !results.length && <p className="px-3 py-6 text-center text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Nothing matches.</p>}
              {results.map((r, k) => (
                <button key={r.hash + k} onMouseEnter={() => setI(k)} onClick={() => go(r)} className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left"
                  style={{ background: k === i ? 'rgba(var(--ink-rgb),.08)' : 'transparent' }}>
                  <span className="w-[62px] shrink-0 text-[12px] font-medium" style={{ color: 'var(--ink-3)' }}>{KINDS[r.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px]">{r.title}</span>
                    {r.sub && <span className="block truncate text-[13px]" style={{ color: 'var(--ink-3)' }}>{r.sub}</span>}
                  </span>
                  {k === i && <ArrowElbowDownLeft size={13} weight="bold" style={{ color: 'var(--ink-3)' }} />}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
