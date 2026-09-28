import { useState } from 'react'
import { ArrowsClockwise, GearSix, MagnifyingGlass } from '@phosphor-icons/react'
import * as api from '../api.js'
import { PRIMARY } from '../pages.js'
import MoreMenu from './MoreMenu.jsx'
import Clock from './Clock.jsx'
import FocusTimer from './FocusTimer.jsx'
import Bell from './Bell.jsx'
import TimeClock from './TimeClock.jsx'
import Reminder from './Reminder.jsx'

/**
 * One line. The wordmark is Home; three text links for the pages of a working day (Board, Logbook,
 * Projects) and More for everything else, grouped (roadmap 130, the list lives in pages.js). Then the
 * clock, the time clock as one control, search and the gear. Sized to read from a normal sitting
 * distance on a 1080p screen.
 * The fading backdrop is its own layer behind the row: a mask on the nav itself would clip anything
 * that opens below it (the time clock panel, the reminder), which is exactly what happened once.
 */
export default function Nav({ route, auth, meta, onRefresh, now, scene, timeclock, onSettings, settingsOpen, onSearch }) {
  const [busy, setBusy] = useState(false)
  const syncedAt = meta.lastSync ? new Date(meta.lastSync).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : null
  // The button reads a bare time; its name says what the time is and what a press does.
  const syncName = meta.lastSyncError ? 'Sync failed, sync again' : busy ? 'Syncing' : syncedAt ? `Sync now, last at ${syncedAt}` : 'Sync'
  const sync = async () => {
    setBusy(true)
    try { await api.sync(); await onRefresh() }
    catch (e) { window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text: 'Sync did not finish.', by: `${e.message}. The board shows what it had; press Sync to try again.`, plain: true } })) }
    finally { setBusy(false) }
  }
  const link = (id, label, i, cls = '') => (
    <a key={id} href={`#/${id}`} title={i !== undefined ? `Press ${i}` : undefined} aria-current={route === id ? 'page' : undefined} className={`-my-[3px] inline-block py-[3px] text-[14px] transition-colors xl:text-[15px] 2xl:text-[16.5px] ${cls}`}
      style={{ color: route === id ? 'var(--ink)' : 'var(--ink-3)' }}>{label}</a>
  )

  return (
    // on-photo: the nav always sits on a photograph, so its fog and its ink stay the night ones in the light theme too
    <nav aria-label="Pages" className="on-photo fixed inset-x-0 top-0 z-50">
      {/* keyboard users' first stop (roadmap 127): inside the nav landmark, visible only while it has focus */}
      <a href="#/" className="skip pill" onClick={e => { e.preventDefault(); const h = document.querySelector('main h1, header h1, h1, main'); if (h) { h.setAttribute('tabindex', '-1'); h.focus() } }}>Skip to content</a>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[150px] 2xl:h-[170px]" style={{
        background: 'linear-gradient(to bottom, rgba(var(--veil),.82) 0%, rgba(var(--veil),.45) 50%, transparent 100%)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        maskImage: 'linear-gradient(to bottom, black 45%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 45%, transparent 100%)' }} />
      <div className="relative mx-auto flex h-[88px] max-w-[1800px] items-start justify-between px-8 pt-6 2xl:h-[104px] 2xl:pt-7">
        <div className="flex shrink-0 items-baseline gap-7 whitespace-nowrap xl:gap-10 2xl:gap-14">
          <a href="#/" title="Home, press 1" aria-current={route === '' ? 'page' : undefined} className="display text-[23px] font-semibold tracking-tight 2xl:text-[27px]">Bench<span style={{ color: 'var(--accent)' }}>.</span></a>
          <div className="hidden items-baseline gap-7 md:flex xl:gap-9 2xl:gap-11">
            {PRIMARY.map(p => link(p.id, p.title, p.key))}
            <MoreMenu route={route} />
          </div>
        </div>
        <div className="relative flex shrink-0 items-center gap-4 whitespace-nowrap xl:gap-5 2xl:gap-6">
          <Clock now={now} scene={scene} />
          <FocusTimer />
          <Bell />
          <TimeClock clock={timeclock?.clock} punch={timeclock?.punch} now={now} />
          <Reminder clock={timeclock?.clock} now={now} />
          {auth.configured && auth.signedIn && (
            <button disabled={busy} title={meta.lastSyncError || auth.username} aria-label={syncName} aria-busy={busy || undefined}
              className="pill btn-quiet flex items-center gap-2 px-4 py-2.5 text-[13.5px] 2xl:px-4.5 2xl:py-3 2xl:text-[15px]"
              onClick={sync}>
              <ArrowsClockwise size={13} weight="bold" />
              <span className="tnum">{meta.lastSyncError ? 'Sync failed' : busy ? 'Syncing' : meta.lastSync
                ? new Date(meta.lastSync).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : 'Sync'}</span>
            </button>
          )}
          <button onClick={onSearch} aria-label="Search" title="Search (Ctrl K or /)" className="grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-[var(--wash)] 2xl:h-11 2xl:w-11" style={{ color: 'var(--ink-3)' }}><MagnifyingGlass size={18} /></button>
          <button onClick={onSettings} aria-label="Settings" title="Settings" aria-expanded={settingsOpen} aria-haspopup="dialog"
            className="grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-[var(--wash)] 2xl:h-11 2xl:w-11" style={{ color: settingsOpen ? 'var(--ink)' : 'var(--ink-3)', background: settingsOpen ? 'var(--wash-2)' : 'transparent' }}>
            <GearSix size={19} weight={settingsOpen ? 'fill' : 'regular'} className="2xl:hidden" /><GearSix size={21} weight={settingsOpen ? 'fill' : 'regular'} className="hidden 2xl:block" />
          </button>
        </div>
      </div>
    </nav>
  )
}
