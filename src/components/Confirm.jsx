import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'

/**
 * The question before something is thrown away (roadmap 127). What `window.confirm` was: the browser's
 * grey box, in the system font, in the middle of the screen. This is Bench's own: the error toast's panel
 * at the bottom centre, one headline with a period, the sentence that says what goes and what stays, one
 * primary pill and a quiet "Keep". Escape keeps. Focus lands on the primary and goes back where it was.
 *
 *   const ok = await ask('Delete "Weekly"?', { yes: 'Delete' })
 *
 * `ask` resolves true or false. ConfirmHost is mounted once in App next to the toasts and answers the
 * `bench:confirm` event, so a component never imports the host.
 */
let seq = 0
export function ask(text, { yes = 'Delete', no = 'Keep', title = null } = {}) {
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent('bench:confirm', { detail: { id: ++seq, text, yes, no, title, resolve } }))
  })
}

export default function ConfirmHost() {
  const [q, setQ] = useState(null)
  const primary = useRef(null)
  const before = useRef(null)
  useEffect(() => {
    const on = e => setQ(prev => { if (prev) prev.resolve(false); return e.detail })
    addEventListener('bench:confirm', on); return () => removeEventListener('bench:confirm', on)
  }, [])
  const answer = (ok) => {
    const cur = q; setQ(null)
    cur?.resolve(ok)
    const b = before.current; if (b && typeof b.focus === 'function') setTimeout(() => b.focus({ preventScroll: true }), 0)
  }
  useEffect(() => {
    if (!q) return
    before.current = document.activeElement
    const t = setTimeout(() => primary.current?.focus(), 30)
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); answer(false) } }
    addEventListener('keydown', key, true)
    return () => { clearTimeout(t); removeEventListener('keydown', key, true) }
  }, [q])   // eslint-disable-line react-hooks/exhaustive-deps
  // The headline: the question's first words, so "Delete the playbook "Frame"?" reads "Delete?" above the sentence.
  const title = q?.title || (q ? (q.text.match(/^(Delete|Remove|Restore|Forget|Reset|Discard|Replace)\b/i)?.[1] || 'Sure') + '.' : '')
  return (
    <AnimatePresence>
      {q && (
        <motion.div key={q.id} role="alertdialog" aria-modal="false" aria-labelledby="confirm-title" aria-describedby="confirm-text"
          initial={{ opacity: 0, y: 14, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 8, x: '-50%' }}
          transition={{ duration: .25, ease: [0.16, 1, 0.3, 1] }}
          className="panel fixed bottom-6 left-1/2 z-[75] flex w-[min(600px,calc(100vw-3rem))] flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5"
          style={{ boxShadow: 'var(--shadow-panel)', borderColor: 'var(--line-2)' }}>
          <div className="min-w-[220px] flex-1">
            <p id="confirm-title" className="display text-[16px] font-semibold leading-snug">{title}</p>
            <p id="confirm-text" className="mt-0.5 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{q.text}</p>
          </div>
          <button ref={primary} onClick={() => answer(true)} className="pill btn-primary shrink-0 px-4 py-2 text-[13px] font-medium">{q.yes}</button>
          <button onClick={() => answer(false)} className="-my-1 inline-block shrink-0 px-2 py-2 text-[13px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-2)' }}>{q.no}</button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
