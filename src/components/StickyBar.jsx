import { motion, AnimatePresence } from 'framer-motion'

export default function StickyBar({ show, stats, children }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -64, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -64, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          className="fixed inset-x-0 top-0 z-50 glass"
          style={{ borderBottom: '1px solid var(--edge)' }}>
          <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex items-baseline gap-4">
              <span className="font-display text-[17px]">Ridgeline</span>
              <span className="hidden text-[11.5px] sm:inline" style={{ color: 'var(--ink-faint)' }}>
                <b className="tnum" style={{ color: 'var(--color-alpenglow)' }}>{stats.today}</b> today
                <span className="mx-2">·</span>
                <b className="tnum">{stats.open}</b> open
              </span>
            </div>
            <div className="flex items-center gap-2">{children}</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
