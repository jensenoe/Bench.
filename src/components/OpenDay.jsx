import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { shortDate } from '../lanes.js'

/**
 * A day that was never clocked out. One line under the nav with a time to close it at, a button
 * that writes the out punch to that day's row, and a way to wave it off when the sheet was fixed by hand.
 */
export default function OpenDay({ clock, onClose, onDismiss }) {
  const u = clock?.unclosed
  const [time, setTime] = useState('17:00')
  const [busy, setBusy] = useState(false)
  const ok = /^([01]?\d|2[0-3]):[0-5]\d$/.test(time)
  const date = u ? shortDate(new Date(u.date + 'T12:00:00')) : ''
  return (
    <AnimatePresence>
      {u && (
        <motion.div key={u.date} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .3 }}
          className="mx-auto col px-6 pt-[104px]">
          <div className="panel flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3.5 text-[13.5px]" style={{ borderColor: '#E8B85A' }}>
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: '#E8B85A' }} />
            <span><span className="font-medium">{date}</span> was never clocked out{u.status === 'lunch' ? ' and is still on lunch' : ''}. Close it at</span>
            <input value={time} onChange={e => setTime(e.target.value)} className="field tnum w-[76px] px-2 py-1 text-center text-[13.5px]" aria-label="Time to close the day" />
            <button disabled={!ok || busy} onClick={async () => { setBusy(true); try { await onClose(time) } finally { setBusy(false) } }}
              className="pill px-4 py-1.5 text-[13px] font-medium disabled:opacity-50" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>Write it to the sheet</button>
            <button onClick={onDismiss} className="ml-auto text-[13px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-3)' }}>Already fixed in Excel</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
