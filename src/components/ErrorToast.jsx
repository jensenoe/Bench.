import { motion, AnimatePresence } from 'motion/react'

/**
 * What the red error pill grew into: says what broke, offers Retry and Dismiss, and is read out as an
 * alert. Bottom centre, stays until dealt with; a dismissed message stays away until the message
 * changes (roadmap 56).
 */
export default function ErrorToast({ message, busy, onRetry, onDismiss }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div key={message} role="alert"
          initial={{ opacity: 0, y: 14, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 8, x: '-50%' }}
          transition={{ duration: .25, ease: [0.16, 1, 0.3, 1] }}
          className="panel fixed bottom-6 left-1/2 z-[70] flex w-[min(600px,calc(100vw-3rem))] items-center gap-4 px-5 py-3.5"
          style={{ boxShadow: 'var(--shadow-panel)', borderColor: 'var(--late)' }}>
          <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--late)' }} />
          <div className="min-w-0 flex-1">
            <p className="display text-[16px] font-semibold leading-snug">Something broke.</p>
            <p className="mt-0.5 truncate text-[13px]" style={{ color: 'var(--ink-2)' }} title={message}>{message}</p>
          </div>
          <button onClick={onRetry} disabled={busy} className="pill shrink-0 px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-60"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>{busy ? 'Trying…' : 'Retry'}</button>
          <button onClick={onDismiss} className="pill shrink-0 px-3 py-1.5 text-[13px]" style={{ border: '1px solid var(--line-2)' }}>Dismiss</button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
