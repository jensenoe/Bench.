import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X } from '@phosphor-icons/react'
import { saveSettings } from '../api.js'

/**
 * A short walk through a page, the first time it is opened. A small card that floats at the bottom left,
 * out of the flow, so it never pushes the work down and arrives a moment after the page (roadmap 173). Got it
 * or the cross puts it away for good; Settings > Introductions can bring them all back.
 *
 * "For good" lives in the per-user settings (`coachDone`, server/settings.js), not in localStorage: the
 * desktop app serves the page from a new port on every start, and localStorage belongs to the origin, so a
 * dismissed card used to come back after each restart. A card dismissed under the old scheme in this window
 * still counts, and is written to the settings the first time it is seen.
 */
const legacyDone = id => { try { return localStorage.getItem(`bench.coach.${id}`) === 'done' } catch { return false } }
const EASE = [0.16, 1, 0.3, 1]

export default function Coach({ id, steps, done = [] }) {
  const seen = (Array.isArray(done) && done.includes(id)) || legacyDone(id)
  const [i, setI] = useState(0)
  const [closed, setClosed] = useState(false)
  const [ready, setReady] = useState(false)
  // the work arrives first; the card follows once the page has settled, and never while a dialog has the screen
  useEffect(() => {
    setI(0); setClosed(false); setReady(false)
    let t = null
    const wait = (ms) => { t = setTimeout(() => { if (document.querySelector('[role="dialog"], [role="alertdialog"]')) wait(800); else setReady(true) }, ms) }
    wait(1200)
    return () => clearTimeout(t)
  }, [id])
  // carry a dismissal from the old localStorage key into the settings, once
  useEffect(() => {
    if (legacyDone(id) && Array.isArray(done) && !done.includes(id)) saveSettings({ coachDone: [...done, id] }).then(() => window.dispatchEvent(new Event('bench:refresh'))).catch(() => {})
  }, [id, done])
  const close = () => {
    setClosed(true)
    try { localStorage.setItem(`bench.coach.${id}`, 'done') } catch { /* no storage in this window; the settings carry it */ }
    saveSettings({ coachDone: [...new Set([...(Array.isArray(done) ? done : []), id])] })
      .then(() => window.dispatchEvent(new Event('bench:refresh')))
      .catch(() => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text: 'The introduction may come back.', by: 'Bench. could not save that it was read. It stays away for now.', plain: true } })))
  }
  const step = steps[i]
  return (
    <AnimatePresence>
      {ready && !seen && !closed && step && (
        <motion.aside key="coach" aria-label="Introduction" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: .4, ease: EASE }}
          className="panel fixed bottom-4 left-4 right-4 z-[60] px-5 py-4 sm:bottom-6 sm:left-6 sm:right-auto sm:w-[380px]"
          style={{ boxShadow: 'var(--shadow-panel)', borderColor: 'var(--line-2)' }}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="display text-[17px] font-semibold leading-tight tracking-tight">{step.title}</h2>
            <button onClick={close} aria-label="Close the introduction" title="Close, for good" className="-mr-1.5 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors hover:bg-[var(--wash)]" style={{ color: 'var(--ink-3)' }}><X size={13} weight="bold" /></button>
          </div>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{step.body}</p>
          <div className="mt-3.5 flex items-center gap-3">
            <div className="flex items-center gap-1.5" aria-hidden="true">{steps.map((_, k) => <span key={k} className="block h-1.5 rounded-full" style={{ width: k === i ? 18 : 6, background: k <= i ? 'var(--accent)' : 'rgba(var(--ink-rgb),.15)' }} />)}</div>
            <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{i + 1} of {steps.length}</span>
            <span className="ml-auto flex items-center gap-2">
              {i > 0 && <button onClick={() => setI(i - 1)} className="pill btn-ghost min-h-6 px-3 py-1.5 text-[13px]">Back</button>}
              {i < steps.length - 1
                ? <button onClick={() => setI(i + 1)} className="pill btn-primary px-4 py-1.5 text-[13px] font-medium">Next</button>
                : <button onClick={close} className="pill btn-primary px-4 py-1.5 text-[13px] font-medium">Got it</button>}
            </span>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

export const COACH = {
  board: [
    { title: 'Five lanes, one cap.', body: 'Today holds five. When it is full, something leaves before anything arrives. That is the whole rule, and it is what keeps the list honest. Drag a card from lane to lane; the lane lights up when it will take it.' },
    { title: 'Where things live.', body: 'Active is started and not finished. Waiting on is out of your hands, with a clock on how long. Innovation is the work that makes next year easier. Parked is shelved on purpose.' },
    { title: 'Moving and finishing.', body: 'The circle ticks a task off, with an Undo for a few seconds. The sliders open every field: checklist, repeat, supplier, notes. Press n anywhere to add a task, / to search, 1 to 9 for the pages, ? for every key.' },
    { title: 'What the tools own.', body: 'Tasks from Issues, QMS, the BOM and Planner keep their title and status from the tool. Everything else on the card is yours: lane, priority, hours, tags, notes.' }
  ],
  logbook: [
    { title: 'One entry per meeting.', body: 'Title, date, who was there, the project. Then the notes, as they happened. A recurring meeting starts from its last entry: same title, people and project, dated today.' },
    { title: 'Decisions and actions apart.', body: 'Decisions are one per line. Actions have an owner and a tick box; the arrow sends one to the board as a task that remembers which meeting it came from.' },
    { title: 'Search finds the sentence.', body: 'The search box looks through titles, notes, names and projects. Bench. saves to the shared folder as you type.' }
  ],
  machines: [
    { title: 'One page per machine.', body: 'You type nothing here. A machine appears as soon as a task carries its name as the project, the BOM lists parts for it, or a Logbook entry names it. The page gathers everything that hangs on it: open work by lane, orders, tickets from the tools, entries.' },
    { title: 'Spellings and mentions.', body: '"M14" and "Machine 14" are two machines until you merge them with "Same machine as" at the bottom of the detail page; Rename sets the name everyone sees. Mentions are tasks that name the machine in their title but carry no project yet; Assign puts them on it.' },
    { title: 'The passport.', body: 'The Passport panel is the machine\'s history on one timeline: created, ordered, delivered, ticket opened and closed, meetings and their decisions. Print gives a black-on-white page for the QMS or the customer. Playbooks apply a standard task set to a new machine in one go.' }
  ],
  projects: [
    { title: 'Your innovation projects, from Planner.', body: 'Every Planner card whose title starts with an I-code (I-1050 Handgrip strength) is a project here, with its stage from the card\'s bucket (Concept, Development, Procurement, Testing, Production) and its due date. Anything that names the code joins its page: your tasks, Logbook entries and their open actions, and the synced Teams folder. Planner stays the source; move the card there.' },
    { title: 'Planned from the date that matters.', body: 'A project is a machine, its deadline (FAT, delivery, handover) and the phases before it, Design to Handover to start with, or the phases and tasks of a playbook. Type the phase lengths in working days and the dates fall out backwards from the deadline: the last phase ends on it, every phase before ends the working day before the next begins.' },
    { title: 'The tasks join by themselves.', body: 'Every task whose Project field reads the machine\'s name belongs to the project. Give each one a phase, here or in the task editor, and the timeline shows its due date inside the phase band. Parts with a supplier get an order-by date from the lead times Bench. has learned; Write the dates onto the parts puts them on the tasks.' },
    { title: 'Room and fit.', body: 'Slack is the working days between the latest due date in a phase and the end of that phase; negative means the plan is already broken there. A task can wait for others: pick it under "waits for", and Bench. walks the chain forward and says which task decides the date. Weekends, the Zurich holidays and your days off never count as working days. Fit compares the sized hours in a phase with the planned time it holds (about six tenths of a workday, the rest is the bench as it comes). The hero on Home says when a deadline is close or the plan is behind.' }
  ]
}
