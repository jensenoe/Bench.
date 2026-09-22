import { useState } from 'react'
import { ArrowsClockwise, GearSix, MagnifyingGlass } from '@phosphor-icons/react'
import * as api from '../api.js'
import { SHEETS } from '../copy.js'
import Clock from './Clock.jsx'
import Punch from './Punch.jsx'
import Reminder from './Reminder.jsx'

/** One line. Text links and a single pill. Sized to read from a normal sitting distance on a 1080p screen. */
export default function Nav({ route, auth, meta, onRefresh, now, scene, timeclock, onSettings, settingsOpen, onSearch }) {
  const [busy, setBusy] = useState(false)
  const link = (id, label) => (
    <a key={id} href={`#/${id}`} className="text-[14px] transition-colors xl:text-[15px] 2xl:text-[16.5px]"
       style={{ color: route === id ? 'var(--ink)' : 'var(--ink-3)' }}>{label}</a>
  )
  const pill = { background: 'var(--ink)', color: 'var(--bg)' }

  return (
    <nav className="fixed inset-x-0 top-0 z-50" style={{
      background: 'linear-gradient(to bottom, rgba(var(--veil),.82) 0%, rgba(var(--veil),.45) 60%, transparent 100%)',
      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      maskImage: 'linear-gradient(to bottom, #000 55%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, #000 55%, transparent 100%)' }}>
      <div className="mx-auto flex h-[88px] max-w-[1800px] items-start justify-between px-8 pt-6 2xl:h-[104px] 2xl:pt-7">
        <div className="flex shrink-0 items-baseline gap-7 whitespace-nowrap xl:gap-10 2xl:gap-14">
          <a href="#/" className="display text-[23px] font-semibold tracking-tight 2xl:text-[27px]">Bench<span style={{ color: 'var(--accent)' }}>.</span></a>
          <div className="hidden items-baseline gap-5 lg:flex xl:gap-7 2xl:gap-9">
            {link('', 'Home')}
            {SHEETS.filter(s => !s.external).map(s => link(s.id, s.title))}
          </div>
        </div>
        <div className="relative flex shrink-0 items-center gap-4 whitespace-nowrap xl:gap-5 2xl:gap-7">
          <Clock now={now} scene={scene} />
          <Punch clock={timeclock?.clock} punch={timeclock?.punch} now={now} canWrite={auth.signedIn} />
          <Reminder clock={timeclock?.clock} now={now} />
          {auth.configured && auth.signedIn && (
            <button disabled={busy} title={meta.lastSyncError || auth.username}
              className="pill flex items-center gap-2 px-4 py-2.5 text-[13.5px] 2xl:px-4.5 2xl:py-3 2xl:text-[15px]" style={{ border: '1px solid var(--line-2)' }}
              onClick={async () => { setBusy(true); try { await api.sync(); await onRefresh() } finally { setBusy(false) } }}>
              <ArrowsClockwise size={13} weight="bold" className={busy ? 'animate-spin' : ''} />
              <span className="tnum">{meta.lastSyncError ? 'Sync failed' : busy ? 'Syncing' : meta.lastSync
                ? new Date(meta.lastSync).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : 'Sync'}</span>
            </button>
          )}
          <button onClick={onSearch} aria-label="Search" title="Search (Ctrl K)" className="grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-[rgba(var(--ink-rgb),.08)] 2xl:h-11 2xl:w-11" style={{ color: 'var(--ink-3)' }}><MagnifyingGlass size={18} /></button>
          <button onClick={onSettings} aria-label="Settings" title="Settings"
            className="grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-[rgba(var(--ink-rgb),.08)] 2xl:h-11 2xl:w-11" style={{ color: settingsOpen ? 'var(--ink)' : 'var(--ink-3)', background: settingsOpen ? 'rgba(var(--ink-rgb),.1)' : 'transparent' }}>
            <GearSix size={19} weight={settingsOpen ? 'fill' : 'regular'} className="2xl:hidden" /><GearSix size={21} weight={settingsOpen ? 'fill' : 'regular'} className="hidden 2xl:block" />
          </button>
        </div>
      </div>
    </nav>
  )
}
