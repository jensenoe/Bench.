import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X } from '@phosphor-icons/react'

/**
 * A short walk through a page, the first time it is opened. One card, a few steps,
 * bottom left, out of the way. Done or the cross puts it away for good; Settings can bring it back.
 */
export default function Coach({ id, steps, delay = 900 }) {
  const KEY = `bench.coach.${id}`
  const [i, setI] = useState(0)
  const [show, setShow] = useState(false)
  useEffect(() => {
    let seen = false
    try { seen = localStorage.getItem(KEY) === 'done' } catch { /* ignore */ }
    if (seen) return
    const t = setTimeout(() => setShow(true), delay); return () => clearTimeout(t)
  }, [KEY, delay])
  const close = () => { setShow(false); try { localStorage.setItem(KEY, 'done') } catch { /* ignore */ } }
  const step = steps[i]
  return (
    <AnimatePresence>
      {show && step && (
        <motion.aside key={i} role="dialog" aria-label="Introduction"
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: .35, ease: [0.16, 1, 0.3, 1] }}
          className="panel fixed bottom-6 left-6 z-[65] w-[min(380px,calc(100vw-3rem))] p-5" style={{ boxShadow: 'var(--shadow-panel)', borderColor: 'var(--line-2)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-1.5">{steps.map((_, k) => <span key={k} className="block h-1.5 rounded-full transition-all" style={{ width: k === i ? 18 : 6, background: k <= i ? 'var(--accent)' : 'rgba(var(--ink-rgb),.15)' }} />)}</div>
            <button onClick={close} aria-label="Close" className="grid h-6 w-6 place-items-center rounded-md" style={{ color: 'var(--ink-3)' }}><X size={12} weight="bold" /></button>
          </div>
          <h3 className="display mt-3 text-[20px] font-semibold leading-tight tracking-tight">{step.title}</h3>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{step.body}</p>
          <div className="mt-4 flex items-center gap-4">
            {i < steps.length - 1
              ? <button onClick={() => setI(i + 1)} className="pill px-4 py-2 text-[12.5px] font-medium" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>Next</button>
              : <button onClick={close} className="pill px-4 py-2 text-[12.5px] font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>Got it</button>}
            {i > 0 && <button onClick={() => setI(i - 1)} className="text-[12px]" style={{ color: 'var(--ink-3)' }}>Back</button>}
            <span className="ml-auto tnum text-[11px]" style={{ color: 'var(--ink-3)' }}>{i + 1} of {steps.length}</span>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

export const COACH = {
  procurement: [
    { title: 'What this page is for.', body: 'Parts with a lead time. Anything you have to order weeks before the build needs it, and anything that is currently in someone else\'s hands.' },
    { title: 'Order by.', body: 'The last day an order can still go out and land in time. Open any task, set its Order by date, and it appears here with a countdown. Inside 14 days it turns amber, past the date red.' },
    { title: 'With other people.', body: 'Tasks in the Waiting on lane show up on the right, oldest first, with how long the other person has had them. Past a week is when a nudge is fair.' },
    { title: 'Home keeps an eye on it.', body: 'The landing page shows how many order dates fall inside a week, so you do not have to come here to be warned. This card will not come back; Settings can reset it.' }
  ],
  board: [
    { title: 'Five lanes, one cap.', body: 'Today holds five. When it is full, something leaves before anything arrives. That is the whole rule, and it is what keeps the list honest.' },
    { title: 'Where things live.', body: 'Active is started and not finished. Waiting on is out of your hands, with a clock on how long. Innovation is the work that makes next year easier. Parked is shelved on purpose.' },
    { title: 'Moving and finishing.', body: 'Hover a card for Today, details, the lane menu and remove. The circle ticks it off, with an Undo for a few seconds. The chips above filter by where a task came from.' },
    { title: 'What the tools own.', body: 'Tasks from Issues, QMS, the BOM and Planner keep their title and status from the tool. Everything else on the card is yours: lane, priority, hours, tags, notes.' }
  ],
  logbook: [
    { title: 'One entry per meeting.', body: 'Title, date, who was there, the project. Then the notes, as they happened.' },
    { title: 'Decisions and actions apart.', body: 'Decisions are one per line. Actions have an owner and a tick box; the arrow sends one to the board as a task that remembers which meeting it came from.' },
    { title: 'Search finds the sentence.', body: 'The search box looks through titles, notes, names and projects. Everything is saved to the shared folder as you type.' }
  ],
  napkin: [
    { title: 'A napkin, not a diagram tool.', body: 'One idea in the middle. Tab makes a child, Enter a sibling, double-click edits. The map lays itself out, but you can drag any node where you want it and its branch follows. Drop it on another node to move it under that one. Tidy puts everything back on the grid.' },
    { title: 'Fold and colour.', body: 'Space folds a branch, C cycles a colour through the branch. Drag the background to pan, scroll to zoom. Maps live in the shared folder like everything else.' }
  ]
}
