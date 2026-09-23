import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import * as api from './api.js'
import { sceneFor, sceneAt, lunchScene, cockpitCover, setCollections, setCadence, nextChange, STATUS } from './scenes.js'
import { SHEETS, cheer } from './copy.js'
import { daysUntil, daysSince } from './lanes.js'
import Nav from './components/Nav.jsx'
import Footer from './components/Footer.jsx'
import Landing from './components/Landing.jsx'
import TerrainHeader from './components/TerrainHeader.jsx'
import Lane from './components/Lane.jsx'
import LeadTime from './components/LeadTime.jsx'
import BomParts from './components/BomParts.jsx'
const Tools = lazy(() => import('./components/Tools.jsx'))
import useClock from './hooks/useClock.js'
import useTimeclock from './hooks/useTimeclock.js'
const Lunch = lazy(() => import('./components/Lunch.jsx'))
const Hours = lazy(() => import('./components/Hours.jsx'))
import Settings from './components/Settings.jsx'
import FirstRun from './components/FirstRun.jsx'
import Toast from './components/Toast.jsx'
import SourceFilter from './components/SourceFilter.jsx'
import PeopleFilter, { isMine } from './components/PeopleFilter.jsx'
const Logbook = lazy(() => import('./components/Logbook.jsx'))
const Napkin = lazy(() => import('./components/Napkin.jsx'))
import Coach, { COACH } from './components/Coach.jsx'
import Search from './components/Search.jsx'
import QuickAdd from './components/QuickAdd.jsx'
import OpenDay from './components/OpenDay.jsx'
import Shortcuts from './components/Shortcuts.jsx'
import ErrorToast from './components/ErrorToast.jsx'
import PageSkeleton from './components/Skeleton.jsx'
import MorningBrief from './components/MorningBrief.jsx'
import EveningClose from './components/EveningClose.jsx'
import * as dayApi from './api/day.js'
const Review = lazy(() => import('./components/Review.jsx'))
const Machines = lazy(() => import('./components/Machines.jsx'))
import useBoardKeys from './hooks/useBoardKeys.js'
const Changes = lazy(() => import('./components/Changes.jsx'))
const Wall = lazy(() => import('./components/Wall.jsx'))
import Inbox from './components/Inbox.jsx'

const route = () => location.hash.replace(/^#\/?/, '').split('?')[0]
const Aside = ({ n, label, tone }) => (
  <div className="panel off-photo px-6 py-4">
    <span className="display tnum text-[32px] font-semibold leading-none" style={{ color: tone }}>{n}</span>
    <span className="ml-2 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>{label}</span>
  </div>
)
const EASE = [0.16, 1, 0.3, 1]
const PAGE_KEYS = { 1: '', 2: 'board', 3: 'procurement', 4: 'tools', 5: 'logbook', 6: 'napkin', 7: 'hours', 8: 'review', 9: 'machines' }
const SOURCE_LABEL = { planner: 'Phase Gate', issues: 'Issues', qms: 'QMS', bom: 'the BOM' }
const inField = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable

export default function App() {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [r, setR] = useState(route)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [keysOpen, setKeysOpen] = useState(false)
  const [briefOpen, setBriefOpen] = useState(false)   // the morning brief (roadmap 68)
  const [closeOpen, setCloseOpen] = useState(false)   // the evening close (roadmap 69)
  const [dismissedError, setDismissedError] = useState(null)
  const [retrying, setRetrying] = useState(false)
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
  // Density and the focus timer's default ride on the root element, so Lane and TaskCard need no extra props.
  useEffect(() => {
    document.documentElement.dataset.density = settings.density === 'compact' ? 'compact' : 'comfortable'
    document.documentElement.dataset.focusMinutes = String(settings.focusMinutes || 25)
  }, [settings.density, settings.focusMinutes])

  const light = settings.theme === 'light'
  useEffect(() => {
    const el = document.documentElement.style
    const t = light && scene.light ? scene.light : scene
    el.setProperty('--glow', t.glow); el.setProperty('--accent', t.accent); el.setProperty('--accent-ink', t.accentInk)
    el.setProperty('--photo-filter', scene.filter); el.setProperty('--grade', scene.grade); el.setProperty('--glow-dark', scene.glow)
  }, [scene, light])
  useEffect(() => {
    const on = () => { setR(route()); window.scrollTo({ top: 0 }) }
    addEventListener('hashchange', on); return () => removeEventListener('hashchange', on)
  }, [])
  // Focus follows the route: after a page change the page heading takes focus, so keyboard and screen
  // reader users land on the content and not in the nav (roadmap 53). Pages are lazy, so wait for it.
  const firstRoute = useRef(true)
  useEffect(() => {
    if (firstRoute.current) { firstRoute.current = false; return }
    const sel = 'main h1, header h1, h1, main h2'
    const leaving = document.querySelector(sel)   // the outgoing page is still on screen while it fades
    let tries = 0
    const id = setInterval(() => {
      const h = document.querySelector(sel)
      if (h && h !== leaving && !inField()) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); clearInterval(id) }
      else if (++tries > 60) clearInterval(id)
    }, 50)
    return () => clearInterval(id)
  }, [r])
  // Keyboard: Ctrl-K or / for search, n for a new task, 1 to 7 for the pages, ? for the key sheet. Never while typing.
  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(v => !v); return }
      if (e.ctrlKey || e.metaKey || e.altKey || inField() || searchOpen || quickOpen || settingsOpen || keysOpen || briefOpen || closeOpen) return
      if (e.key === '?') { e.preventDefault(); setKeysOpen(true) }
      else if (e.key === '/') { e.preventDefault(); setSearchOpen(true) }
      else if (e.key === 'n') { e.preventDefault(); setQuickOpen(true) }
      else if (PAGE_KEYS[e.key] !== undefined) { location.hash = `#/${PAGE_KEYS[e.key]}` }
    }
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey)
  }, [searchOpen, quickOpen, settingsOpen])
  // The next slot's pictures are fetched a little early, so the change at the boundary does not flash.
  useEffect(() => {
    const nx = nextChange(now)
    if (nx.getTime() - now.getTime() > 75_000 || now.getSeconds() % 15 !== 0) return
    const key = settings.sceneOverride || sceneFor(nx).key
    const urls = new Set([sceneAt(key, nx).terrain, sceneAt('dawn', nx, 5).terrain, sceneAt('dusk', nx).terrain, sceneAt('night', nx).terrain, sceneAt('dusk', nx, 3).terrain, sceneAt('day', nx, 3).terrain])
    for (const u of urls) { const img = new Image(); img.decoding = 'async'; img.src = u }
  }, [now, settings.sceneOverride])
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
    showToast({ text: b.added ? `${b.added} new from the tools.` : `${b.closed} closed upstream.`, by: parts.join(', '), plain: true }, 7000)
  }, [state?.background, showToast])
  // Once per start: is there a newer Bench? Quiet unless there is.
  useEffect(() => {
    if (!state?.settings?.setupDone) return
    let on = true
    api.checkUpdates().then(u => {
      if (!on) return
      // A downloaded installer waits for the next quit (roadmap 76); otherwise the plain "it is out" line.
      if (u?.downloaded && window.bench?.installUpdateNow) showToast({ text: `Bench ${u.downloaded.version} is ready.`, by: 'It installs itself the next time Bench quits.', plain: true, link: { label: 'Install now', onClick: () => window.bench.installUpdateNow(u.downloaded.path) } }, 14000)
      else if (u?.newer) showToast({ text: `Bench ${u.latest} is out.`, by: `You have ${u.current}. Settings > About has the download.`, plain: true, link: { label: 'Download the installer', url: u.download || u.url } }, 12000)
    }).catch(() => {})
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
  const retry = useCallback(async () => { setRetrying(true); try { await refresh(); await timeclock.refresh() } finally { setRetrying(false) } }, [refresh, timeclock])
  // The brief opens once per start, when the setting is on and today's brief has not been seen.
  const briefChecked = useRef(false)
  useEffect(() => {
    if (briefChecked.current || !state?.settings?.setupDone || settings.morningBrief === false) return
    briefChecked.current = true
    dayApi.getBrief().then(b => { if (!b.seen) setBriefOpen(true) }).catch(() => {})
  }, [state?.settings?.setupDone, settings.morningBrief])
  // j and k walk the cards on the Board (roadmap 88); Ctrl Alt B anywhere in Windows opens the quick add (roadmap 80).
  useBoardKeys(r === 'board')
  useEffect(() => window.bench?.onQuickAdd?.(() => setQuickOpen(true)), [])
  // A successful out punch opens the close. Nav, Lunch and the tray go through this wrapper.
  const punch = useCallback(async (kind) => {
    const r = await timeclock.punch(kind)
    if (r && kind === 'out' && settings.eveningClose !== false) setCloseOpen(true)
    return r
  }, [timeclock, settings.eveningClose])
  const tc = { ...timeclock, punch }
  // Any component or hook can raise a toast or ask for fresh state without a prop chain.
  useEffect(() => {
    const onToast = e => { if (e.detail?.text) showToast({ plain: true, ...e.detail }, e.detail.ms || 6200) }
    const onRefresh = () => { refresh(); timeclock.refresh() }
    addEventListener('bench:toast', onToast); addEventListener('bench:refresh', onRefresh)
    return () => { removeEventListener('bench:toast', onToast); removeEventListener('bench:refresh', onRefresh) }
  }, [showToast, refresh, timeclock])

  if (!state) return <PageSkeleton message={error ? `Server not reachable. ${error}` : null} />

  if (!settings.setupDone) return <FirstRun scene={scene} auth={state.auth} onSave={saveSettings} onRefresh={refresh} />
  // Wall mode: the board for a workshop screen, alone, no nav and no footer (roadmap 84). Escape leaves.
  if (r === 'wall') return <Suspense fallback={<PageSkeleton />}><Wall scene={scene} settings={settings} /></Suspense>

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
  const machineCount = new Set(open.map(t => (t.project || t.meta?.machine || '').trim().toLowerCase()).filter(k => k.length >= 2)).size
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
  const errMsg = error || timeclock.error || null

  return (
    <div className="min-h-screen" style={{ background: (r === '' || onLunch) ? 'var(--bg)' : `radial-gradient(120% 60% at 50% 0%, ${scene.glow} 0%, var(--bg) 60%)` }}>
      <Nav route={r} auth={state.auth} meta={state.meta} onRefresh={refresh} now={now} scene={scene} timeclock={tc}
        onSettings={() => setSettingsOpen(v => !v)} settingsOpen={settingsOpen} onSearch={() => setSearchOpen(true)} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onSave={saveSettings} auth={state.auth} timeclock={timeclock} onRefresh={refresh} />
      <Toast item={toast} onDismiss={() => setToast(null)} />
      <Search open={searchOpen} onClose={() => setSearchOpen(false)} tasks={state.tasks} actions={[
        // the command palette (roadmap 86): typed with > or matched by label
        { label: 'Clock in', hint: 'Start the day', run: () => punch('in') },
        { label: 'Clock out', hint: 'End the day', run: () => punch('out') },
        { label: 'Lunch', hint: 'Start the break', run: () => punch('lunchOut') },
        { label: 'Back from lunch', hint: 'End the break', run: () => punch('lunchIn') },
        { label: settings.theme === 'light' ? 'Dark theme' : 'Light theme', hint: 'Switch the theme', run: () => saveSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' }) },
        { label: settings.density === 'compact' ? 'Comfortable cards' : 'Compact cards', hint: 'Switch the density', run: () => saveSettings({ density: settings.density === 'compact' ? 'comfortable' : 'compact' }) },
        { label: 'Open the data folder', hint: 'tasks.json and the backups', run: () => window.bench?.openDataFolder?.() },
        { label: 'New task', hint: 'Quick add', run: () => setQuickOpen(true) },
        { label: 'New Logbook entry', hint: 'A meeting or a note', run: () => { location.hash = '#/logbook?new=' } },
        { label: 'Morning brief', hint: 'What the day holds', run: () => setBriefOpen(true) },
        { label: 'Close the day', hint: 'Roll Today, write the day note', run: () => setCloseOpen(true) },
        { label: 'Keys', hint: 'Every shortcut', run: () => setKeysOpen(true) },
        { label: 'Wall mode', hint: 'The board for a big screen', run: () => { location.hash = '#/wall' } },
        { label: 'Weekly review', hint: 'What moved and what did not', run: () => { location.hash = '#/review' } },
        { label: 'Machines', hint: 'One page per machine', run: () => { location.hash = '#/machines' } },
        { label: 'Check for updates', hint: 'Ask GitHub now', run: () => api.checkUpdates(true).then(u => showToast({ text: u.newer ? `Bench ${u.latest} is out.` : `Bench ${u.current} is the latest.`, plain: true })).catch(() => {}) }
      ]} />
      <Shortcuts open={keysOpen} onClose={() => setKeysOpen(false)} />
      <MorningBrief open={briefOpen} onClose={() => setBriefOpen(false)} onChanged={refresh} />
      <EveningClose open={closeOpen} onClose={() => setCloseOpen(false)} onChanged={refresh} />
      <QuickAdd open={quickOpen} onClose={() => setQuickOpen(false)} onCreate={onCreate} defaultLane={r === 'board' && stats.today < 5 ? 'today' : 'active'} />
      <ErrorToast message={errMsg && errMsg !== dismissedError ? errMsg : null} busy={retrying} onRetry={retry} onDismiss={() => setDismissedError(errMsg)} />
      {!onLunch && <OpenDay clock={timeclock.clock} onClose={closeDay} onDismiss={dismissDay} />}

      <Suspense fallback={<PageSkeleton />}>
      <AnimatePresence mode="wait">
        {r === '' && page('home', <Landing scene={scene} stats={stats} pressing={pressing} sheetState={sheetState} doorImages={{ board: boardImage, procurement: { src: sceneAt('dusk', now).terrain, fallback: '/terrain/dusk.jpg' }, tools: { src: sceneAt('night', now).terrain, fallback: '/terrain/night.jpg' }, cockpit: cockpitCover(now), logbook: { src: sceneAt('dusk', now, 3).terrain, fallback: '/terrain/dusk.jpg' }, napkin: { src: sceneAt('day', now, 3).terrain, fallback: '/terrain/day.jpg' } }} name={settings.name} late={workingLate} hoursIn={hoursIn} />)}

        {onLunch && page('lunch', <Lunch clock={timeclock.clock} punch={punch} now={now} scene={scene} />)}

        {r === 'machines' && page('machines', <>
          <TerrainHeader compact scene={sceneAt('night', now, 2)} title="Machines" line="Everything that hangs on one machine: tasks, orders, tickets, notes and maps, in one place."
            aside={<Aside n={machineCount} label={machineCount === 1 ? 'machine' : 'machines'} tone="var(--accent)" />} />
          <div className="relative"><Machines tasks={state.tasks} onPatch={onPatch} onDelete={onDelete} /></div>
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
      </Suspense>

      <Footer compact={inner} name={settings.name} version={state.version} scene={scene} glow={light && scene.light ? scene.light.glow : scene.glow} now={now} onSettings={() => setSettingsOpen(true)} />
    </div>
  )
}
