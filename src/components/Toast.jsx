import { motion, AnimatePresence } from 'motion/react'
import { Coffee, Drop, ArrowUp, ArrowSquareOut } from '@phosphor-icons/react'
import { openExternal } from '../api.js'

/**
 * The completion toast. One line that means it, a name if it is borrowed, and a nudge
 * towards water or coffee. Bottom right, gone in six seconds, click to dismiss. Undo, when there is
 * something to undo, sits in the corner. The same box says "Removed." after a delete.
 */
export default function Toast({ item, onDismiss }) {
  const icon = item?.nudge ? (/coffee|kettle|espresso|cup/i.test(item.nudge) ? <Coffee size={13} weight="bold" /> : /water|glass|litre|drink|sip|bottle|refill|hydrat/i.test(item.nudge) ? <Drop size={13} weight="bold" /> : <ArrowUp size={13} weight="bold" />) : null
  return (
    <AnimatePresence>
      {item && (
        <motion.button key={item.id} onClick={onDismiss} aria-live="polite"
          initial={{ opacity: 0, y: 18, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .98 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className={`panel fixed bottom-6 right-6 z-[70] w-[min(360px,calc(100vw-3rem))] text-left px-5 py-4 ${item.undo ? 'pr-20' : ''}`}
          style={{ boxShadow: 'var(--shadow-panel)', borderColor: 'var(--line-2)' }}>
          <p className="display text-[17px] font-semibold leading-snug tracking-tight">{item.text}</p>
          {item.by && <p className={`mt-1 ${item.plain ? 'text-[13.5px] truncate' : 'text-[13px]'}`} style={{ color: item.plain ? 'var(--ink-2)' : 'var(--ink-3)' }}>{item.by}</p>}
          {item.nudge && (
            <p className="mt-3 flex items-center gap-2 text-[13.5px]" style={{ color: 'var(--accent)' }}>{icon}<span style={{ color: 'var(--ink-2)' }}>{item.nudge}</span></p>
          )}
          {item.tool && (
            <span role="link" tabIndex={0} onClick={e => { e.stopPropagation(); openExternal(item.tool.url) }} onKeyDown={e => e.key === 'Enter' && openExternal(item.tool.url)}
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}>
              Done here only. Close it in {item.tool.label} too <ArrowSquareOut size={11} weight="bold" />
            </span>
          )}
          {item.link && (
            <span role="link" tabIndex={0} onClick={e => { e.stopPropagation(); openExternal(item.link.url) }} onKeyDown={e => e.key === 'Enter' && openExternal(item.link.url)}
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] underline-offset-2 hover:underline" style={{ color: 'var(--accent)' }}>
              {item.link.label} <ArrowSquareOut size={11} weight="bold" />
            </span>
          )}
          {item.undo && (
            <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); item.undo(); onDismiss() }} onKeyDown={e => { if (e.key === 'Enter') { item.undo(); onDismiss() } }}
              className="pill absolute right-4 top-4 px-3 py-1.5 text-[13px] font-medium" style={{ border: '1px solid var(--line-2)', color: 'var(--ink)' }}>Undo</span>
          )}
          <motion.span className="absolute inset-x-5 bottom-0 h-px origin-left" style={{ background: 'var(--accent)' }}
            initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: item.plain ? 7 : 6, ease: 'linear' }} />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
