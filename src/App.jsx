import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import * as api from './api.js'
import { sceneFor, sceneAt, lunchScene, cockpitCover, setCollections, setCadence, STATUS } from './scenes.js'
import { SHEETS, cheer } from './copy.js'
import { daysUntil, daysSince } from './lanes.js'
import Nav from './components/Nav.jsx'
import Footer from './components/Footer.jsx'
import Landing from './components/Landing.jsx'
import TerrainHeader from './components/TerrainHeader.jsx'
import Lane from './components/Lane.jsx'
import LeadTime from './components/LeadTime.jsx'
import TaskCard from './components/TaskCard.jsx'
import Tools from './components/Tools.jsx'
import useClock from './hooks/useClock.js'
import useTimeclock from './hooks/useTimeclock.js'
import Lunch from './components/Lunch.jsx'
import Settings from './components/Settings.jsx'
import FirstRun from './components/FirstRun.jsx'
import Toast from './components/Toast.jsx'
import SourceFilter from './components/SourceFilter.jsx'
import Logbook from './components/Logbook.jsx'
import Napkin from './components/Napkin.jsx'
import Coach, { COACH } from './components/Coach.jsx'
import Search from './components/Search.jsx'

const route = () => location.hash.replace(/^#\/?/, '').split('?')[0]
const Aside = ({ n, label, tone }) => (
  <div className="panel off-photo px-6 py-4">
    <span className="display tnum text-[32px] font-semibold leading-none" style={{ color: tone }}>{n}</span>
    <span className="ml-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>{label}</span>
  </div>
)
const EASE = [0.16, 1, 0.3, 1]

export default function App() {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [r, setR] = useState(route)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [sourceFilter, setSourceFilter] = useState('all')
  const now = useClock()
  const timeclock = useTimeclock()
  const onLunch = r === 'lunch'
  const settings = state?.settings || {}
  // settings drive the pictures and the theme; apply before computing the scene
  setCollections(settings.collections)
  setCadence(settings.pictureMinutes)
  const sceneKey = settings.sceneOverride || null
  const scene = onLunch ? lunchScene(now) : sceneKey ? sceneAt(sceneKey, now) : sceneFor(now)
  useEffect(() => { document.documentElement.dataset.theme = settings.theme === 'light' ? 'light' : 'dark' }, [settings.theme])

  const light = settings.theme === 'light'
  useEffect(() => {
    const el = document.documentElement.style
    const t = light && scene.light ? scene.light : scene
    el.setProperty('--glow', t.glow); el.setProperty('--accent', t.accent); el.setProperty('--accent-ink', t.accentInk)
  }, [scene, light])
  useEffect(() => {
    const on = () => { setR(route()); window.scrollTo({ top: 0 }) }
    addEventListener('hashchange', on); return () => removeEventListener('hashchange', on)
  }, [])
  // Ctrl-K / Cmd-K opens search anywhere
  useEffect(() => {
    const onKey = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(v => !v) } }
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey)
  }, [])
  // A clicked notification asks the window to jump somewhere (the lunch screen at noon).
  useEffect(() => window.bench?.onRoute?.(route => { location.hash = route }), [])
  const refresh = useCallback(async () => { try { setState(await api.getState()); setError(null) } catch (e) { setError(e.message) } }, [])
  useEffect(() => { refresh(); const id = setInterval(refresh, 60_000); return () => clearInterval(id) }, [refresh])
  const mutate = fn => async (...a) => { try { await fn(...a); await refresh() } catch (e) { setError(e.message) } }
  const onCreate = mutate(api.createTask)
  const showToast = useCallback((item, ms = 6200) => {
    setToast({ id: Date.now(), ...item })
    clearTimeout(showToast.timer); showToast.timer = setTimeout(() => setToast(null), ms)
  }, [])
  // Delete is undoable for a few seconds: the task comes back with its fields, under a new id.
  const onDelete = useCallback(async (id) => {
    try {
      const gone = state?.tasks.find(t => t.id === id)
      await api.removeTask(id)
      await refresh()
      if (gone) showToast({ text: 'Removed.', by: gone.title, plain: true, undo: async () => { if (gone.source && gone.source !== 'local') await api.syncSource(gone.source).catch(() => {}); else await api.createTask({ ...gone, id: undefined }); await refresh() } }, 7000)
    } catch (e) { setError(e.message) }
  }, [state, refresh, showToast])
  const onPatch = useCallback(async (id, patch) => {
    try {
      const before = state?.tasks.find(t => t.id === id)
      await api.patchTask(id, patch)
      if (patch.done === true && before && !before.done) {
        const c = cheer({ withNudge: settings.nudges !== false })
        const TOOL = { issues: 'Issues', qms: 'QMS', bom: 'the BOM' }
        const tool = before.url && TOOL[before.source] ? { label: TOOL[before.source], url: before.url } : null
        showToast({ ...c, tool, undo: async () => { await api.patchTask(id, { done: false }); await refresh() } })
      }
      await refresh()
    } catch (e) { setError(e.message) }
  }, [state, settings.nudges, refresh, showToast])
  const saveSettings = useCallback(async (patch) => {
    try { const s = await api.saveSettings(patch); setState(st => st ? { ...st, settings: s } : st) } catch (e) { setError(e.message) }
  }, [])

  if (!state) return (
    <div className="grid min-h-screen place-items-center">
      <motion.p animate={{ opacity: [.35, 1, .35] }} transition={{ repeat: Infinity, duration: 1.8 }} className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
        {error ? `Server not reachable. ${error}` : 'Loading'}
      </motion.p>
    </div>
  )

  if (!settings.setupDone) return <FirstRun scene={scene} auth={state.auth} onSave={saveSettings} onRefresh={refresh} />

  const open = state.tasks.filter(t => !t.done)
  const bySource = t => sourceFilter === 'all' || (sourceFilter === 'local' ? (!t.source || t.source === 'local') : t.source === sourceFilter)
  const byLane = k => state.tasks.filter(t => t.lane === k && bySource(t))
  const held = open.filter(t => t.lane === 'waiting')
  const dated = open.filter(t => t.orderBy)
  const pressing = dated.filter(t => daysUntil(t.orderBy) <= 14)
    .map(t => ({ id: t.id, title: t.title, days: daysUntil(t.orderBy) })).sort((a, b) => a.days - b.days)
  const innovationCold = Math.max(0, ...open.filter(t => t.lane === 'innovation').map(t => daysSince(t.lastTouched) ?? 0))
  const stats = { open: open.length, today: open.filter(t => t.lane === 'today').length, waiting: held.length,
    innovation: open.filter(t => t.lane === 'innovation').length, pressing: pressing.filter(p => p.days <= 7).length, innovationCold }
  const late = pressing.filter(p => p.days < 0).length
  // Late: still on the clock after 19:00, or more than ten hours in. The greeting says so first.
  const clockNow = timeclock.clock
  const inSince = clockNow?.events?.find(e => e.kind === 'in')?.at
  const hoursIn = inSince ? (now - new Date(inSince)) / 3600000 : 0
  const workingLate = ['in', 'lunch'].includes(clockNow?.status) && (now.getHours() >= 19 || hoursIn >= 10)
  const logCount = state.logbookCount ?? 0
  const sheetState = {
    logbook: { text: logCount ? `${logCount} ${logCount === 1 ? 'entry' : 'entries'}` : 'Nothing written yet' },
    napkin: { text: state.napkinCount ? `${state.napkinCount} ${state.napkinCount === 1 ? 'map' : 'maps'}` : 'A clean napkin' },
    board: { text: `${stats.today} on today, ${stats.open} open`, tone: stats.today > 5 ? STATUS.overdue : undefined },
    procurement: { text: pressing.length ? `${late} late, ${pressing.length - late} due` : 'Clear', tone: late ? STATUS.overdue : pressing.length ? STATUS.caution : STATUS.done },
    tools: (() => {
      const ext = open.filter(t => ['issues', 'qms', 'bom'].includes(t.source)).length
      const srcs = Object.values(state.sources || {})
      const pending = srcs.filter(x => x.kind === 'site' && x.available && x.signedIn === false).length
      return { text: pending ? `${pending} of 3 tools need sign-in` : `${ext} assigned across tools`, tone: pending ? STATUS.caution : undefined }
    })()
  }
  // The Board wears a dawn picture a few slots along, so it never repeats the hero; in Alps slots it is your own ridge photo.
  const boardImage = scene.library === 'alps' ? { src: '/terrain/ridge.jpg', fallback: '/terrain/day.jpg' } : { src: sceneAt('dawn', now, 5).terrain, fallback: '/terrain/dawn.jpg' }
  const page = (key, node) => (
    <motion.div key={key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .4, ease: EASE }}>{node}</motion.div>
  )

  return (
    <div className="min-h-screen" style={{ background: (r === '' || onLunch) ? 'var(--bg)' : `radial-gradient(120% 60% at 50% 0%, ${scene.glow} 0%, var(--bg) 60%)` }}>
      <Nav route={r} auth={state.auth} meta={state.meta} onRefresh={refresh} now={now} scene={scene} timeclock={timeclock}
           onSettings={() => setSettingsOpen(v => !v)} settingsOpen={settingsOpen} onSearch={() => setSearchOpen(true)} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onSave={saveSettings} auth={state.auth} timeclock={timeclock} onRefresh={refresh} />
      <Toast item={toast} onDismiss={() => setToast(null)} />
      <Search open={searchOpen} onClose={() => setSearchOpen(false)} tasks={state.tasks} />
      {(error || timeclock.error) && <p className="pill fixed bottom-5 left-1/2 z-50 -translate-x-1/2 px-4 py-2 text-[12.5px]" style={{ background: STATUS.overdue, color: '#2A0A08' }}>{error || timeclock.error}</p>}

      <AnimatePresence mode="wait">
        {r === '' && page('home', <Landing scene={scene} stats={stats} pressing={pressing} sheetState={sheetState} doorImages={{ board: boardImage, procurement: { src: sceneAt('dusk', now).terrain, fallback: '/terrain/dusk.jpg' }, tools: { src: sceneAt('night', now).terrain, fallback: '/terrain/night.jpg' }, cockpit: cockpitCover(now), logbook: { src: sceneAt('dusk', now, 3).terrain, fallback: '/terrain/dusk.jpg' }, napkin: { src: sceneAt('day', now, 3).terrain, fallback: '/terrain/day.jpg' } }} name={settings.name} late={workingLate} hoursIn={hoursIn} />)}

        {onLunch && page('lunch', <Lunch clock={timeclock.clock} punch={timeclock.punch} now={now} scene={scene} />)}

        {r === 'board' && page('board', <>
          <TerrainHeader scene={{ ...scene, terrain: boardImage.src, fallback: boardImage.fallback }} title="Board" line={SHEETS[0].body}
            aside={<Aside n={stats.today} label="of 5 on today" tone={stats.today > 5 ? STATUS.overdue : 'var(--accent)'} />} />
          <main className="mx-auto col px-6">
            <SourceFilter tasks={state.tasks} value={sourceFilter} onChange={setSourceFilter} />
            <div className="grid gap-4 lg:grid-cols-2">
              <Lane laneKey="today" wide tasks={byLane('today')} onPatch={onPatch} onDelete={onDelete} onCreate={onCreate} />
              {['innovation', 'waiting', 'active', 'parked'].map(k => <Lane key={k} laneKey={k} tasks={byLane(k)} onPatch={onPatch} onDelete={onDelete} onCreate={onCreate} />)}
            </div>
          </main>
          <Coach id="board" steps={COACH.board} />
        </>)}

        {r === 'procurement' && page('proc', <>
          <Coach id="procurement" steps={COACH.procurement} />
          <TerrainHeader scene={sceneAt('dusk', now)} title="Procurement" line={SHEETS[1].body}
            aside={<Aside n={pressing.length} label="order dates in 14 days" tone={late ? STATUS.overdue : pressing.length ? STATUS.caution : STATUS.done} />} />
          <main className="mx-auto col px-6">
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3">
                {pressing.length ? <LeadTime items={pressing} /> :
                  <section className="panel p-7"><h2 className="display text-[30px] font-semibold leading-none">Order dates.</h2>
                    <p className="mt-3 text-[13px]" style={{ color: 'var(--ink-3)' }}>Nothing inside 14 days. Add an order-by date to any task with a lead time worth tracking.</p></section>}
              </div>
              <section className="panel p-6 sm:p-7 lg:col-span-2">
                <div className="flex items-baseline justify-between"><h2 className="display text-[22px] font-semibold leading-none">With other people.</h2>
                  <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{held.length}</span></div>
                <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>Longest first. Past a week, chase.</p>
                <ul className="mt-5 flex flex-col gap-2">
                  {held.slice().sort((a, b) => (daysSince(b.waitingSince) ?? 0) - (daysSince(a.waitingSince) ?? 0)).map(t => <TaskCard key={t.id} task={t} onPatch={onPatch} onDelete={onDelete} />)}
                </ul>
                {!held.length && <p className="py-4 text-center text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Nothing is with anyone else.</p>}
              </section>
            </div>
          </main>
        </>)}

        {r === 'logbook' && page('logbook', <>
          <TerrainHeader scene={sceneAt('dusk', now, 3)} title="Logbook" line={SHEETS[3].body}
            aside={<Aside n={logCount} label={logCount === 1 ? 'entry' : 'entries'} tone="var(--accent)" />} />
          <Logbook onRefresh={refresh} />
          <Coach id="logbook" steps={COACH.logbook} />
        </>)}

        {r === 'napkin' && page('napkin', <>
          <TerrainHeader scene={sceneAt('day', now, 3)} title="Napkin" line={SHEETS[4].body} />
          <Napkin />
          <Coach id="napkin" steps={COACH.napkin} />
        </>)}

        {r === 'tools' && page('tools', <>
          <TerrainHeader scene={sceneAt('night', now)} title="Tools" line={SHEETS[2].body}
            aside={<Aside n={open.filter(t => t.source && t.source !== 'local').length} label="assigned to you" tone="var(--accent)" />} />
          <Tools state={state} onPatch={onPatch} onDelete={onDelete} onRefresh={refresh} onConnect={() => setSettingsOpen(true)} />
        </>)}
      </AnimatePresence>

      <Footer name={settings.name} version={state.version} scene={scene} glow={light && scene.light ? scene.light.glow : scene.glow} now={now} onSettings={() => setSettingsOpen(true)} />
    </div>
  )
}
