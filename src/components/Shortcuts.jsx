import { Fragment, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'

/**
 * The key sheet. `?` opens it from anywhere; Escape, the Close button or a click outside shuts it.
 * Bench has a dozen shortcuts and this is the one place that lists them (roadmap 55).
 */
const GROUPS = [
  { title: 'Anywhere', keys: [
    ['n', 'New task'],
    ['/ or Ctrl K', 'Search tasks, notes, maps and pages'],
    ['1 to 9', 'Home, Board, Procurement, Tools, Logbook, Napkin, Hours, Review, Machines'],
    ['> in search', 'Actions: clock in, theme, new task and more'],
    ['Ctrl Alt B', 'Quick add from anywhere in Windows'],
    ['?', 'This sheet'],
    ['Esc', 'Close whatever is open']
  ] },
  { title: 'Board, with a card focused', keys: [
    ['j / k', 'Next or previous card'],
    ['e or Enter', 'Open or close the details'],
    ['x', 'Tick it, or reopen it'],
    ['Alt ← / Alt →', 'Move it one lane left or right'],
    ['Del', 'Remove it']
  ] },
  { title: 'Quick add', keys: [
    ['Alt 1 to 5', 'Pick the lane: Today, Innovation, Waiting, Active, Parked'],
    ['Enter', 'Add it']
  ] },
  { title: 'Napkin, with a node selected', keys: [
    ['Tab', 'A child node'],
    ['Enter', 'A sibling'],
    ['F2', 'Rename'],
    ['Space', 'Tick it'],
    ['Del', 'Remove it'],
    ['c', 'Next colour'],
    ['t', 'Send it to the board']
  ] }
]

export default function Shortcuts({ open, onClose }) {
  const closeBtn = useRef(null), before = useRef(null)
  useEffect(() => {
    if (open) { before.current = document.activeElement; const id = setTimeout(() => closeBtn.current?.focus(), 40); return () => clearTimeout(id) }
    before.current?.focus?.()
  }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="keys" className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto px-4 pb-8 pt-[10vh]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .15 }}
          style={{ background: 'rgba(var(--page-veil),.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', overscrollBehavior: 'contain' }} onMouseDown={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="keys-title"
            initial={{ y: -10, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -6, scale: .98 }} transition={{ duration: .18, ease: [0.16, 1, 0.3, 1] }}
            className="panel w-full max-w-[560px] px-6 py-5" style={{ boxShadow: 'var(--shadow-panel)' }} onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="keys-title" className="display text-[24px] font-semibold leading-none">Keys.</h2>
                <p className="mt-2 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>They do nothing while you type in a field.</p>
              </div>
              <button ref={closeBtn} onClick={onClose} className="pill px-3.5 py-1.5 text-[13px] font-medium" style={{ border: '1px solid var(--line-2)' }}>Close</button>
            </div>
            {GROUPS.map(g => (
              <section key={g.title} className="mt-5" aria-label={g.title}>
                <h3 className="text-[13px] font-medium" style={{ color: 'var(--ink-3)' }}>{g.title}</h3>
                <dl className="mt-2 grid grid-cols-[auto_1fr] items-baseline gap-x-5 gap-y-2 text-[13.5px]">
                  {g.keys.map(([k, what]) => (
                    <Fragment key={k}>
                      <dt><kbd className="tnum inline-block rounded-[4px] px-1.5 py-[1px] text-[12.5px] font-medium" style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)' }}>{k}</kbd></dt>
                      <dd style={{ color: 'var(--ink-2)' }}>{what}</dd>
                    </Fragment>
                  ))}
                </dl>
              </section>
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
