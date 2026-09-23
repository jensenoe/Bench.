import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api.js'
import { sceneFor, sceneAt, lunchScene, setCollections, setCadence, nextChange, STATUS } from './scenes.js'
import { cheer } from './copy.js'
import { daysUntil, daysSince } from './lanes.js'
import Nav from './components/Nav.jsx'
import Footer from './components/Footer.jsx'
import useClock from './hooks/useClock.js'
import useTimeclock from './hooks/useTimeclock.js'
import Settings from './components/Settings.jsx'
import FirstRun from './components/FirstRun.jsx'
import Toast from './components/Toast.jsx'
import { isMine } from './components/PeopleFilter.jsx'
import Search from './components/Search.jsx'
import QuickAdd from './components/QuickAdd.jsx'
import OpenDay from './components/OpenDay.jsx'
import Shortcuts from './components/Shortcuts.jsx'
import ErrorToast from './components/ErrorToast.jsx'
import PageSkeleton from './components/Skeleton.jsx'
import MorningBrief from './components/MorningBrief.jsx'
import EveningClose from './components/EveningClose.jsx'
import * as dayApi from './api/day.js'
import useBoardKeys from './hooks/useBoardKeys.js'
import { Routes, paletteActions } from './routes.jsx'
const Wall = lazy(() => import('./components/Wall.jsx'))

const route = () => location.hash.replace(/^#\/?/, '').split('?')[0]
const PAGE_KEYS = { 1: '', 2: 'board', 3: 'procurement', 4: 'tools', 5: 'logbook', 6: 'napkin', 7: 'hours', 8: 'review', 9: 'machines' }
const SOURCE_LABEL = { planner: 'Phase Gate', issues: 'Issues', qms: 'QMS', bom: 'the BOM' }
const inField = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable

/** State and wiring only: the pages live in routes.jsx, the components under src/components. */
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
  // The hook hands back a fresh object every render; effects and callbacks lean on its stable functions, never the object.
  const refreshClock = timeclock.refresh, punchClock = timeclock.punch
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
  // Keyboard: Ctrl-K or / for search, n for a new task, 1 to 9 for the pages, ? for the key sheet. Never while typing.
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
  }, [searchOpen, quickOpen, settingsOpen, keysOpen, briefOpen, closeOpen])
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
  // Every minute while the window shows; a hidden window (closed to the tray) does not poll, and catches up when it comes back (roadmap 102).
  useEffect(() => {
    refresh()
    const id = setInterval(() => { if (!document.hidden) refresh() }, 60_000)
    const onShow = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', onShow)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onShow) }
  }, [refresh])

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
  const closeDay = useCallback(async (time) => { try { await api.closeUnclosed(time); await refreshClock(); showToast({ text: 'Closed.', by: 'The out punch is on its way to the sheet.', plain: true }) } catch (e) { setError(e.message) } }, [refreshClock, showToast])
  const dismissDay = useCallback(async () => { try { await api.dismissUnclosed(); await refreshClock() } catch (e) { setError(e.message) } }, [refreshClock])
  const retry = useCallback(async () => { setRetrying(true); try { await refresh(); await refreshClock() } finally { setRetrying(false) } }, [refresh, refreshClock])
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
    const r = await punchClock(kind)
    if (r && kind === 'out' && settings.eveningClose !== false) setCloseOpen(true)
    return r
  }, [punchClock, settings.eveningClose])
  const tc = { ...timeclock, punch }
  // Any component or hook can raise a toast or ask for fresh state without a prop chain.
  useEffect(() => {
    const onToast = e => { if (e.detail?.text) showToast({ plain: true, ...e.detail }, e.detail.ms || 6200) }
    const onRefresh = () => { refresh(); refreshClock() }
    addEventListener('bench:toast', onToast); addEventListener('bench:refresh', onRefresh)
    return () => { removeEventListener('bench:toast', onToast); removeEventListener('bench:refresh', onRefresh) }
  }, [showToast, refresh, refreshClock])

  if (!state) return <PageSkeleton message={error ? `Server not reachable. ${error}` : null} />

  if (!settings.setupDone) return <FirstRun scene={scene} auth={state.auth} onSave={saveSettings} onRefresh={refresh} />
  // Wall mode: the board for a workshop screen, alone, no nav and no footer (roadmap 84). Escape leaves.
  if (r === 'wall') return <Suspense fallback={<PageSkeleton />}><Wall scene={scene} settings={settings} /></Suspense>

  // What the pages read: the open tasks by lane and by filter, the order dates, the counts for the headers and the doors.
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
  const inner = r !== '' && !onLunch
  const errMsg = error || timeclock.error || null
  const openSettings = () => setSettingsOpen(true)

  return (
    <div className="min-h-screen" style={{ background: (r === '' || onLunch) ? 'var(--bg)' : `radial-gradient(120% 60% at 50% 0%, ${scene.glow} 0%, var(--bg) 60%)` }}>
      <Nav route={r} auth={state.auth} meta={state.meta} onRefresh={refresh} now={now} scene={scene} timeclock={tc}
        onSettings={() => setSettingsOpen(v => !v)} settingsOpen={settingsOpen} onSearch={() => setSearchOpen(true)} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onSave={saveSettings} auth={state.auth} timeclock={timeclock} onRefresh={refresh} />
      <Toast item={toast} onDismiss={() => setToast(null)} />
      <Search open={searchOpen} onClose={() => setSearchOpen(false)} tasks={state.tasks}
        actions={paletteActions({ settings, punch, saveSettings, openQuickAdd: () => setQuickOpen(true), openBrief: () => setBriefOpen(true), openClose: () => setCloseOpen(true), openKeys: () => setKeysOpen(true) })} />
      <Shortcuts open={keysOpen} onClose={() => setKeysOpen(false)} />
      <MorningBrief open={briefOpen} onClose={() => setBriefOpen(false)} onChanged={refresh} />
      <EveningClose open={closeOpen} onClose={() => setCloseOpen(false)} onChanged={refresh} />
      <QuickAdd open={quickOpen} onClose={() => setQuickOpen(false)} onCreate={onCreate} defaultLane={r === 'board' && stats.today < 5 ? 'today' : 'active'} />
      <ErrorToast message={errMsg && errMsg !== dismissedError ? errMsg : null} busy={retrying} onRetry={retry} onDismiss={() => setDismissedError(errMsg)} />
      {!onLunch && <OpenDay clock={timeclock.clock} onClose={closeDay} onDismiss={dismissDay} />}

      <Suspense fallback={<PageSkeleton />}>
        <Routes r={r} onLunch={onLunch} now={now} scene={scene} boardImage={boardImage}
          state={state} settings={settings} open={open} stats={stats} pressing={pressing} later={later} late={late} sheetState={sheetState} machineCount={machineCount} logCount={logCount} workingLate={workingLate} hoursIn={hoursIn}
          sourceFilter={sourceFilter} setSourceFilter={setSourceFilter} peopleFilter={peopleFilter} setPeopleFilter={setPeopleFilter} byLane={byLane}
          refresh={refresh} onPatch={onPatch} onDelete={onDelete} onCreate={onCreate} punch={punch} openSettings={openSettings}
          timeclock={timeclock} />
      </Suspense>

      <Footer compact={inner} name={settings.name} version={state.version} scene={scene} glow={light && scene.light ? scene.light.glow : scene.glow} now={now} onSettings={openSettings} />
    </div>
  )
}
