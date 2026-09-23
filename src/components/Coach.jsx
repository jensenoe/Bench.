import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X } from '@phosphor-icons/react'

/**
 * A short walk through a page, the first time it is opened. One panel at the top of the page,
 * in the flow, so it never sits on top of the thing it is explaining. Got it or the cross puts it
 * away for good; Settings can bring it back.
 */
export default function Coach({ id, steps }) {
  const KEY = `bench.coach.${id}`
  const [i, setI] = useState(0)
  const [show, setShow] = useState(() => { try { return localStorage.getItem(KEY) !== 'done' } catch { return true } })
  useEffect(() => { try { setShow(localStorage.getItem(KEY) !== 'done') } catch { /* ignore */ } setI(0) }, [KEY])
  const close = () => { setShow(false); try { localStorage.setItem(KEY, 'done') } catch { /* ignore */ } }
  const step = steps[i]
  return (
    <AnimatePresence initial={false}>
      {show && step && (
        <motion.div key="coach" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: .3, ease: [0.16, 1, 0.3, 1] }} className="mx-auto col overflow-hidden px-6">
          <aside aria-label="Introduction" className="row mb-4 flex flex-wrap items-start gap-x-6 gap-y-3 px-5 py-4" style={{ borderColor: 'var(--line-2)' }}>
            <div className="flex items-center gap-1.5 pt-2">{steps.map((_, k) => <span key={k} className="block h-1.5 rounded-full transition-[width,background-color]" style={{ width: k === i ? 18 : 6, background: k <= i ? 'var(--accent)' : 'rgba(var(--ink-rgb),.15)' }} />)}</div>
            <div className="min-w-[260px] flex-1">
              <h2 className="display text-[18px] font-semibold leading-tight tracking-tight">{step.title}</h2>
              <p className="mt-1 max-w-[80ch] text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{step.body}</p>
            </div>
            <div className="flex items-center gap-3 pt-1">
              {i > 0 && <button onClick={() => setI(i - 1)} className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Back</button>}
              {i < steps.length - 1
                ? <button onClick={() => setI(i + 1)} className="pill px-4 py-2 text-[13px] font-medium" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>Next</button>
                : <button onClick={close} className="pill px-4 py-2 text-[13px] font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>Got it</button>}
              <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{i + 1} of {steps.length}</span>
              <button onClick={close} aria-label="Close" className="grid h-6 w-6 place-items-center rounded-md" style={{ color: 'var(--ink-3)' }}><X size={12} weight="bold" /></button>
            </div>
          </aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export const COACH = {
  procurement: [
    { title: 'What this page is for.', body: 'Parts with a lead time. Anything you have to order weeks before the build needs it. Open any task, set its Order by date, and it appears here with the date and a countdown; add the supplier and the PO number once it is ordered.' },
    { title: 'Order by.', body: 'The last day an order can still go out and land in time. Inside 14 days it turns amber, past the date red. Ordered on, once set, turns the line green and stops the countdown.' },
    { title: 'Home keeps an eye on it.', body: 'The landing page shows how many order dates fall inside a week, so you do not have to come here to be warned. This card will not come back; Settings can reset it.' }
  ],
  board: [
    { title: 'Five lanes, one cap.', body: 'Today holds five. When it is full, something leaves before anything arrives. That is the whole rule, and it is what keeps the list honest. Drag a card from lane to lane; the lane lights up when it will take it.' },
    { title: 'Where things live.', body: 'Active is started and not finished. Waiting on is out of your hands, with a clock on how long. Innovation is the work that makes next year easier. Parked is shelved on purpose.' },
    { title: 'Moving and finishing.', body: 'The circle ticks a task off, with an Undo for a few seconds. The sliders open every field: checklist, repeat, supplier, notes. Press n anywhere to add a task, / to search, 1 to 7 for the pages, ? for every key.' },
    { title: 'What the tools own.', body: 'Tasks from Issues, QMS, the BOM and Planner keep their title and status from the tool. Everything else on the card is yours: lane, priority, hours, tags, notes.' }
  ],
  logbook: [
    { title: 'One entry per meeting.', body: 'Title, date, who was there, the project. Then the notes, as they happened. A recurring meeting starts from its last entry: same title, people and project, dated today.' },
    { title: 'Decisions and actions apart.', body: 'Decisions are one per line. Actions have an owner and a tick box; the arrow sends one to the board as a task that remembers which meeting it came from.' },
    { title: 'Search finds the sentence.', body: 'The search box looks through titles, notes, names and projects. Everything is saved to the shared folder as you type.' }
  ],
  napkin: [
    { title: 'A napkin, not a diagram tool.', body: 'One idea in the middle. Tab makes a child, Enter a sibling, double-click edits. The map lays itself out, but you can drag any node where you want it and its branch follows. Drop it on another node to move it under that one. Tidy puts everything back on the grid.' },
    { title: 'Fold, colour, export.', body: 'Space folds a branch, C cycles a colour through the branch, T turns the selected node into a task on the board. Export saves the map as a picture. Drag the background to pan, scroll to zoom.' }
  ]
}
