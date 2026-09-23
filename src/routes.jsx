import { lazy } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import * as api from './api.js'
import { sceneAt, cockpitCover, STATUS } from './scenes.js'
import { SHEETS } from './copy.js'
import Landing from './components/Landing.jsx'
import TerrainHeader from './components/TerrainHeader.jsx'
import Lane from './components/Lane.jsx'
import LeadTime from './components/LeadTime.jsx'
import BomParts from './components/BomParts.jsx'
import SourceFilter from './components/SourceFilter.jsx'
import PeopleFilter from './components/PeopleFilter.jsx'
import Coach, { COACH } from './components/Coach.jsx'
import Inbox from './components/Inbox.jsx'
const Tools = lazy(() => import('./components/Tools.jsx'))
const Lunch = lazy(() => import('./components/Lunch.jsx'))
const Hours = lazy(() => import('./components/Hours.jsx'))
const Logbook = lazy(() => import('./components/Logbook.jsx'))
const Napkin = lazy(() => import('./components/Napkin.jsx'))
const Review = lazy(() => import('./components/Review.jsx'))
const Machines = lazy(() => import('./components/Machines.jsx'))
const Changes = lazy(() => import('./components/Changes.jsx'))
const Playbooks = lazy(() => import('./components/Playbooks.jsx'))
const Suppliers = lazy(() => import('./components/Suppliers.jsx'))

/**
 * The pages (roadmap 103). App.jsx holds the state and the wiring; this file says which page shows for
 * which hash and what each one gets. Every page is one `page()` under an AnimatePresence in wait mode,
 * so the old page fades before the new one arrives. Wall mode is not here: App renders it alone.
 */
const EASE = [0.16, 1, 0.3, 1]
const Aside = ({ n, label, tone }) => (
  <div className="panel off-photo px-6 py-4">
    <span className="display tnum text-[32px] font-semibold leading-none" style={{ color: tone }}>{n}</span>
    <span className="ml-2 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{label}</span>
  </div>
)
const page = (key, node) => (
  <motion.div key={key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .4, ease: EASE }}>{node}</motion.div>
)

/**
 * Props, grouped:
 *   route       r (the hash route), onLunch, now, scene, boardImage
 *   data        state, settings, open (open tasks), stats, pressing, later, late, sheetState, machineCount, logCount, workingLate, hoursIn
 *   filters     sourceFilter, setSourceFilter, peopleFilter, setPeopleFilter, byLane
 *   actions     refresh, onPatch, onDelete, onCreate, punch, openSettings
 *   clock       timeclock (the hook's object: clock, error, punch, reset, refresh)
 */
export function Routes({
  r, onLunch, now, scene, boardImage,
  state, settings, open, stats, pressing, later, late, sheetState, machineCount, logCount, workingLate, hoursIn,
  sourceFilter, setSourceFilter, peopleFilter, setPeopleFilter, byLane,
  refresh, onPatch, onDelete, onCreate, punch, openSettings,
  timeclock
}) {
  return (
    <AnimatePresence mode="wait">
      {r === '' && page('home', <Landing scene={scene} stats={stats} pressing={pressing} sheetState={sheetState} doorImages={{ board: boardImage, procurement: { src: sceneAt('dusk', now).terrain, fallback: '/terrain/dusk.jpg' }, tools: { src: sceneAt('night', now).terrain, fallback: '/terrain/night.jpg' }, cockpit: cockpitCover(now), logbook: { src: sceneAt('dusk', now, 3).terrain, fallback: '/terrain/dusk.jpg' }, napkin: { src: sceneAt('day', now, 3).terrain, fallback: '/terrain/day.jpg' } }} name={settings.name} late={workingLate} hoursIn={hoursIn} />)}

      {onLunch && page('lunch', <Lunch clock={timeclock.clock} punch={punch} now={now} scene={scene} />)}

      {r === 'machines' && page('machines', <>
        <TerrainHeader compact scene={sceneAt('night', now, 2)} title="Machines" line="Everything that hangs on one machine: tasks, orders, tickets, notes and maps, in one place."
          aside={<Aside n={machineCount} label={machineCount === 1 ? 'machine' : 'machines'} tone="var(--accent)" />} />
        <div className="relative"><Machines tasks={state.tasks} onPatch={onPatch} onDelete={onDelete} /></div>
      </>)}

      {r === 'playbooks' && page('playbooks', <>
        <TerrainHeader compact scene={sceneAt('day', now, 4)} title="Playbooks" line="The standard task set for a machine, applied in one go, and a template made from a finished one." />
        <div className="relative"><Playbooks /></div>
      </>)}

      {r === 'review' && page('review', <>
        <TerrainHeader compact scene={sceneAt('day', now, 2)} title="Review" line="The week as short sentences: done, slipped, hours, what moved." />
        <div className="relative"><Review /></div>
      </>)}

      {r === 'board' && page('board', <>
        <TerrainHeader compact scene={{ ...scene, terrain: boardImage.src, fallback: boardImage.fallback }} title="Board" line={SHEETS[0].body}
          aside={<Aside n={stats.today} label="of 5 on today" tone={stats.today > 5 ? STATUS.overdue : 'var(--accent)'} />} />
        <div className="relative">
          <Coach id="board" steps={COACH.board} />
          <main className="mx-auto col px-6">
            <SourceFilter tasks={state.tasks} value={sourceFilter} onChange={setSourceFilter} />
            <PeopleFilter tasks={state.tasks} value={peopleFilter} onChange={setPeopleFilter} name={settings.name} />
            <Inbox tasks={state.tasks} />
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              <Lane laneKey="today" wide tasks={byLane('today')} onPatch={onPatch} onDelete={onDelete} onCreate={onCreate} />
              {['innovation', 'waiting', 'active', 'parked'].map(k => <Lane key={k} laneKey={k} tasks={byLane(k)} onPatch={onPatch} onDelete={onDelete} onCreate={onCreate} />)}
            </div>
            <div className="mt-4"><Changes /></div>
          </main>
        </div>
      </>)}

      {r === 'procurement' && page('proc', <>
        <TerrainHeader compact scene={sceneAt('dusk', now)} title="Procurement" line={SHEETS[1].body}
          aside={<Aside n={pressing.length} label="order dates in 14 days" tone={late ? STATUS.overdue : pressing.length ? STATUS.caution : STATUS.done} />} />
        <div className="relative">
          <Coach id="procurement" steps={COACH.procurement} />
          <main className="mx-auto col flex flex-col gap-4 px-6">
            {pressing.length ? <LeadTime items={pressing} /> :
              <section className="panel p-7"><h2 className="display text-[30px] font-semibold leading-none">Order dates.</h2>
                <p className="mt-3 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Nothing inside 14 days. Add an order-by date to any task with a lead time worth tracking; the supplier and the PO number go on the same card once it is ordered.</p></section>}
            {later.length > 0 && <LeadTime items={later} compact title="Later, and ordered." span={`${later.length} more`} />}
            <BomParts tasks={state.tasks} />
            <Suppliers />
          </main>
        </div>
      </>)}

      {r === 'logbook' && page('logbook', <>
        <TerrainHeader compact scene={sceneAt('dusk', now, 3)} title="Logbook" line={SHEETS[3].body}
          aside={<Aside n={logCount} label={logCount === 1 ? 'entry' : 'entries'} tone="var(--accent)" />} />
        <div className="relative">
          <Coach id="logbook" steps={COACH.logbook} />
          <Logbook onRefresh={refresh} />
        </div>
      </>)}

      {r === 'napkin' && page('napkin', <>
        <TerrainHeader compact scene={sceneAt('day', now, 3)} title="Napkin" line={SHEETS[4].body} />
        <div className="relative">
          <Coach id="napkin" steps={COACH.napkin} />
          <Napkin />
        </div>
      </>)}

      {r === 'tools' && page('tools', <>
        <TerrainHeader compact scene={sceneAt('night', now)} title="Tools" line={SHEETS[2].body}
          aside={<Aside n={open.filter(t => t.source && t.source !== 'local').length} label="assigned to you" tone="var(--accent)" />} />
        <div className="relative"><Tools state={state} onPatch={onPatch} onDelete={onDelete} onRefresh={refresh} onConnect={openSettings} /></div>
      </>)}

      {r === 'hours' && page('hours', <>
        <TerrainHeader compact scene={sceneAt('dawn', now, 2)} title="Hours" line="The month as the Zeiterfassung sheet sees it, with what still waits to be written." />
        <div className="relative"><Hours clock={timeclock.clock} /></div>
      </>)}
    </AnimatePresence>
  )
}

/**
 * The command palette's actions (roadmap 86): typed with > or matched by label in the search box.
 * ctx: { settings, punch, saveSettings, openQuickAdd, openBrief, openClose, openKeys }. The update check answers
 * through a bench:toast event, the same road every component takes to a toast.
 */
const toast = (text) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, plain: true } }))
export function paletteActions({ settings, punch, saveSettings, openQuickAdd, openBrief, openClose, openKeys }) {
  return [
    { label: 'Clock in', hint: 'Start the day', run: () => punch('in') },
    { label: 'Clock out', hint: 'End the day', run: () => punch('out') },
    { label: 'Lunch', hint: 'Start the break', run: () => punch('lunchOut') },
    { label: 'Back from lunch', hint: 'End the break', run: () => punch('lunchIn') },
    { label: settings.theme === 'light' ? 'Dark theme' : 'Light theme', hint: 'Switch the theme', run: () => saveSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' }) },
    { label: settings.density === 'compact' ? 'Comfortable cards' : 'Compact cards', hint: 'Switch the density', run: () => saveSettings({ density: settings.density === 'compact' ? 'comfortable' : 'compact' }) },
    { label: 'Open the data folder', hint: 'tasks.json and the backups', run: () => window.bench?.openDataFolder?.() },
    { label: 'New task', hint: 'Quick add', run: openQuickAdd },
    { label: 'New Logbook entry', hint: 'A meeting or a note', run: () => { location.hash = '#/logbook?new=' } },
    { label: 'Morning brief', hint: 'What the day holds', run: openBrief },
    { label: 'Close the day', hint: 'Roll Today, write the day note', run: openClose },
    { label: 'Keys', hint: 'Every shortcut', run: openKeys },
    { label: 'Wall mode', hint: 'The board for a big screen', run: () => { location.hash = '#/wall' } },
    { label: 'Weekly review', hint: 'What moved and what did not', run: () => { location.hash = '#/review' } },
    { label: 'Machines', hint: 'One page per machine', run: () => { location.hash = '#/machines' } },
    { label: 'Playbooks', hint: 'Standard task sets per machine', run: () => { location.hash = '#/playbooks' } },
    { label: 'Check for updates', hint: 'Ask GitHub now', run: () => api.checkUpdates(true).then(u => toast(u.newer ? `Bench ${u.latest} is out.` : `Bench ${u.current} is the latest.`)).catch(() => {}) }
  ]
}
