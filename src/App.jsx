import { useCallback, useEffect, useRef, useState } from 'react'
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
import BomParts from './components/BomParts.jsx'
import Tools from './components/Tools.jsx'
import useClock from './hooks/useClock.js'
import useTimeclock from './hooks/useTimeclock.js'
import Lunch from './components/Lunch.jsx'
import Hours from './components/Hours.jsx'
import Settings from './components/Settings.jsx'
import FirstRun from './components/FirstRun.jsx'
import Toast from './components/Toast.jsx'
import SourceFilter from './components/SourceFilter.jsx'
import PeopleFilter, { isMine } from './components/PeopleFilter.jsx'
import Logbook from './components/Logbook.jsx'
import Napkin from './components/Napkin.jsx'
import Coach, { COACH } from './components/Coach.jsx'
import Search from './components/Search.jsx'
import QuickAdd from './components/QuickAdd.jsx'
import OpenDay from './components/OpenDay.jsx'

const route = () => location.hash.replace(/^#\/?/, '').split('?')[0]
const Aside = ({ n, label, tone }) => (
  <div className="panel off-photo px-6 py-4">
    <span className="display tnum text-[32px] font-semibold leading-none" style={{ color: tone }}>{n}</span>
    <span className="ml-2 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{label}</span>
  </div>
)
const EASE = [0.16, 1, 0.3, 1]
const PAGE_KEYS = { 1: '', 2: 'board', 3: 'procurement', 4: 'tools', 5: 'logbook', 6: 'napkin', 7: 'hours' }
const SOURCE_LABEL = { planner: 'Phase Gate', issues: 'Issues', qms: 'QMS', bom: 'the BOM' }
const inField = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable

export default function App() {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [r, setR] = useState(route)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [peopleFilter, setPeopleFilter] = useState('everyone')
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
  // Keyboard: Ctrl-K or / for search, n for a new task, 1 to 7 for the pages. Never while typing.
  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(v => !v); return }
      if (e.ctrlKey || e.metaKey || e.altKey || inField() || searchOpen || quickOpen || settingsOpen) return
      if (e.key === '/') { e.preventDefault(); setSearchOpen(true) }
      else if (e.key === 'n') { e.preventDefault(); setQuickOpen(true) }
      else if (PAGE_KEYS[e.key] !== undefined) { location.hash = `#/${PAGE_KEYS[e.key]}` }
    }
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey)
  }, [searchOpen, quickOpen, settingsOpen])
  // A clicked notification asks the window to jump somewhere (the lunch screen at noon).
  useEffect(() => window.bench?.onRoute?.(route => { location.hash = route }), [])
  const refresh = useCallback(async () => { try { setState(await api.getState()); setError(null) } catch (e) { setError(e.message) } }, [])
  useEffect(() => { refresh(); const id = setInterval(refresh, 60_000); return () => clearInterval(id) }, [refresh])

  const toastTimer = useRef(null)
  const showToast = useCallback((item, ms = 6200) => {
    setToast({ id: Date.now(), ...item })
    clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), ms)
  }, [])
  // A refused write (Today is full) is a message, not a fault.
  const fail = useCallback((e) => { if (/Today is full/.test(e.message)) showToast({ text: 'Today is full.', by: 'Five is the rule. Move something out before this comes in.', plain: true }, 5000); else setError(e.message) }, [showToast])
  const mutate = fn => async (...a) => { try { const r = await fn(...a); await refresh(); return r } catch (e) { fail(e); throw e } }
  const onCreate = mutate(api.createTask)

  // The background sync says what it brought, once, when it brought something.
  const seenSync = useRef(null)
  useEffect(() => {
    const b = state?.background
    if (!b || b.at === seenSync.current) return
    const first = seenSync.current === null
    seenSync.current = b.at
    if (first || (!b.added && !b.closed)) return
    const parts = Object.entries(b.sources || {}).filter(([, v]) => v.added || v.closed).map(([k, v]) => `${[v.added ? `${v.added} new` : null, v.closed ? `${v.closed} closed` : null].filter(Boolean).join(', ')} from ${SOURCE_LABEL[k] || k}`)
    showToast({ text: b.added ? `${b.added} new from the tools.` : `${b.closed} closed upstream.`, by: parts.join(' · '), plain: true }, 7000)
  }, [state?.background, showToast])
  // Once per start: is there a newer Bench? Quiet unless there is.
  useEffect(() => {
    if (!state?.settings?.setupDone) return
    let on = true
    api.checkUpdates().then(u => { if (on && u?.newer) showToast({ text: `Bench ${u.latest} is out.`, by: `You have ${u.current}. Settings > About has the download.`, plain: true, tool: { label: 'GitHub', url: u.download || u.url } }, 12000) }).catch(() => {})
    return () => { on = false }
  }, [state?.settings?.setupDone])   // eslint-disable-line react-hooks/exhaustive-deps

  // Delete is undoable for a few seconds: the task comes back with its fields, under a new id.
  const onDelete = useCallback(async (id) => {
    try {
      const gone = state?.tasks.find(t => t.id === id)
      await api.removeTask(id)
      await refresh()
      if (gone) showToast({ text: 'Removed.', by: gone.title, plain: true, undo: async () => { if (gone.source && gone.source !== 'local') await api.syncSource(gone.source).catch(() => {}); else await api.createTask({ ...gone, id: undefined }); await refresh() } }, 7000)
    } catch (e) { fail(e) }
  }, [state, refresh, showToast, fail])
  const onPatch = useCallback(async (id, patch) => {
    try {
      const before = state?.tasks.find(t => t.id === id)
      const r = await api.patchTask(id, patch)
      if (patch.done === true && before && !before.done) {
        const c = cheer({ withNudge: settings.nudges !== false })
        const TOOL = { issues: 'Issues', qms: 'QMS', bom: 'the BOM' }
        const tool = before.url && TOOL[before.source] ? { label: TOOL[before.source], url: before.url } : null
        const next = r?.task?.spawned
        showToast({ ...c, tool, by: next ? `Next one is on the board for ${next.dueDate || 'later'}.` : c.by, undo: async () => { await api.patchTask(id, { done: false }); await refresh() } })
      }
      await refresh()
    } catch (e) { fail(e) }
  }, [state, settings.nudges, refresh, showToast, fail])
  const saveSettings = useCallback(async (patch) => {
    try { const s = await api.saveSettings(patch); setState(st => st ? { ...st, settings: s } : st) } catch (e) { setError(e.message) }
  }, [])
  const closeDay = useCallback(async (time) => { try { await api.closeUnclosed(time); await timeclock.refresh(); showToast({ text: 'Closed.', by: 'The out punch is on its way to the sheet.', plain: true }) } catch (e) { setError(e.message) } }, [timeclock, showToast])
  const dismissDay = useCallback(async () => { try { await api.dismissUnclosed(); await timeclock.refresh() } catch (e) { setError(e.message) } }, [timeclock])

  if (!state) return (
    <div className="grid min-h-screen place-items-center">
      <motion.p animate={{ opacity: [.35, 1, .35] }} transition={{ repeat: Infinity, duration: 1.8 }} className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>
        {error ? `Server not reachable. ${error}` : 'Loading'}
      </motion.p>
    </div>
  )

  if (!settings.setupDone) return <FirstRun scene={scene} auth={state.auth} onSave={saveSettings} onRefresh={refresh} />

  const open = state.tasks.filter(t => !t.done)
  const bySource = t => sourceFilter === 'all' || (sourceFilter === 'local' ? (!t.source || t.source === 'local') : t.source === sourceFilter)
  const byPerson = t => peopleFilter === 'everyone' || (peopleFilter === 'mine' ? isMine(t.lead, settings.name) : t.lead === peopleFilter)
  const byLane = k => state.tasks.filter(t => t.lane === k && bySource(t) && byPerson(t))
  const held = open.filter(t => t.lane === 'waiting')
  const dated = open.filter(t => t.orderBy).map(t => ({ id: t.id, title: t.title, days: daysUntil(t.orderBy), orderBy: t.orderBy, orderedOn: t.orderedOn, supplier: t.supplier, poNumber: t.poNumber })).sort((a, b) => a.days - b.days)
  const pressing = dated.filter(t => t.days <= 14 && !t.orderedOn)
  const later = dated.filter(t => t.days > 14 || t.orderedOn)
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
  const inner = r !== '' && !onLunch

  return (
    <div className="min-h-screen" style={{ background: (r === '' || onLunch) ? 'var(--bg)' : `radial-gradient(120% 60% at 50% 0%, ${scene.glow} 0%, var(--bg) 60%)` }}>
      <Nav route={r} auth={state.auth} meta={state.meta} onRefresh={refresh} now={now} scene={scene} timeclock={timeclock}
        onSettings={() => setSettingsOpen(v => !v)} settingsOpen={settingsOpen} onSearch={() => setSearchOpen(true)} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onSave={saveSettings} auth={state.auth} timeclock={timeclock} onRefresh={refresh} />
      <Toast item={toast} onDismiss={() => setToast(null)} />
      <Search open={searchOpen} onClose={() => setSearchOpen(false)} tasks={state.tasks} />
      <QuickAdd open={quickOpen} onClose={() => setQuickOpen(false)} onCreate={onCreate} defaultLane={r === 'board' && stats.today < 5 ? 'today' : 'active'} />
      {(error || timeclock.error) && <p className="pill fixed bottom-5 left-1/2 z-50 -translate-x-1/2 px-4 py-2 text-[13px]" style={{ background: STATUS.overdue, color: '#2A0A08' }}>{error || timeclock.error}</p>}
      {!onLunch && <OpenDay clock={timeclock.clock} onClose={closeDay} onDismiss={dismissDay} />}

      <AnimatePresence mode="wait">
        {r === '' && page('home', <Landing scene={scene} stats={stats} pressing={pressing} sheetState={sheetState} doorImages={{ board: boardImage, procurement: { src: sceneAt('dusk', now).terrain, fallback: '/terrain/dusk.jpg' }, tools: { src: sceneAt('night', now).terrain, fallback: '/terrain/night.jpg' }, cockpit: cockpitCover(now), logbook: { src: sceneAt('dusk', now, 3).terrain, fallback: '/terrain/dusk.jpg' }, napkin: { src: sceneAt('day', now, 3).terrain, fallback: '/terrain/day.jpg' } }} name={settings.name} late={workingLate} hoursIn={hoursIn} />)}

        {onLunch && page('lunch', <Lunch clock={timeclock.clock} punch={timeclock.punch} now={now} scene={scene} />)}

        {r === 'board' && page('board', <>
          <TerrainHeader compact scene={{ ...scene, terrain: boardImage.src, fallback: boardImage.fallback }} title="Board" line={SHEETS[0].body}
            aside={<Aside n={stats.today} label="of 5 on today" tone={stats.today > 5 ? STATUS.overdue : 'var(--accent)'} />} />
          <div className="relative">
          <Coach id="board" steps={COACH.board} />
          <main className="mx-auto col px-6">
            <SourceFilter tasks={state.tasks} value={sourceFilter} onChange={setSourceFilter} />
            <PeopleFilter tasks={state.tasks} value={peopleFilter} onChange={setPeopleFilter} name={settings.name} />
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              <Lane laneKey="today" wide tasks={byLane('today')} onPatch={onPatch} onDelete={onDelete} onCreate={onCreate} />
              {['innovation', 'waiting', 'active', 'parked'].map(k => <Lane key={k} laneKey={k} tasks={byLane(k)} onPatch={onPatch} onDelete={onDelete} onCreate={onCreate} />)}
            </div>
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
          <div className="relative"><Tools state={state} onPatch={onPatch} onDelete={onDelete} onRefresh={refresh} onConnect={() => setSettingsOpen(true)} /></div>
        </>)}

        {r === 'hours' && page('hours', <>
          <TerrainHeader compact scene={sceneAt('dawn', now, 2)} title="Hours" line="The month as the Zeiterfassung sheet sees it, with what still waits to be written." />
          <div className="relative"><Hours clock={timeclock.clock} /></div>
        </>)}
      </AnimatePresence>

      <Footer compact={inner} name={settings.name} version={state.version} scene={scene} glow={light && scene.light ? scene.light.glow : scene.glow} now={now} onSettings={() => setSettingsOpen(true)} />
    </div>
  )
}
