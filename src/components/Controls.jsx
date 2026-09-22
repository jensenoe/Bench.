import { useEffect, useState } from 'react'
import { ArrowsClockwise, CircleHalf, Sun, Moon } from '@phosphor-icons/react'
import * as api from '../api.js'

const btn = { border: '1px solid var(--rule)', color: 'var(--ink-soft)' }

export function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('sheet-theme') || 'auto' } catch { return 'auto' }
  })
  useEffect(() => {
    const el = document.documentElement
    if (theme === 'auto') el.removeAttribute('data-theme')
    else el.setAttribute('data-theme', theme)
    try { localStorage.setItem('sheet-theme', theme) } catch { /* private mode */ }
  }, [theme])

  const next = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto'
  const Icon = { auto: CircleHalf, light: Sun, dark: Moon }[theme]

  return (
    <button onClick={() => setTheme(next)} style={btn}
      aria-label={`Theme: ${theme}. Switch to ${next}.`} title={`Theme: ${theme}`}
      className="grid h-7 w-7 place-items-center">
      <Icon size={13} weight="bold" />
    </button>
  )
}

export function SyncControl({ auth, meta, onRefresh }) {
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState(null)

  if (!auth.configured) {
    return <span className="anno px-2 py-1.5" style={btn}>local only</span>
  }

  if (!auth.signedIn) {
    return (
      <div className="relative">
        <button disabled={busy} style={btn} className="px-2.5 py-1.5 text-[11.5px]"
          onClick={async () => { setBusy(true); try { setCode(await api.signIn()) } finally { setBusy(false) } }}>
          {busy ? 'Starting…' : 'Connect Planner'}
        </button>
        {code?.userCode && (
          <div className="absolute right-0 top-full z-50 mt-1 w-[280px] p-3 text-[12px]"
               style={{ background: 'var(--sheet-lift)', border: '1px solid var(--rule-strong)' }}>
            <p>Open <a className="underline" href={code.verificationUri} target="_blank" rel="noreferrer">
              {code.verificationUri}</a> and enter</p>
            <p className="num my-2 py-2 text-center text-[17px] tracking-[0.2em]"
               style={{ border: '1px solid var(--rule)' }}>{code.userCode}</p>
            <button className="anno underline" onClick={() => { setCode(null); onRefresh() }}>
              I've signed in
            </button>
          </div>
        )}
      </div>
    )
  }

  const last = meta.lastSync
    ? new Date(meta.lastSync).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : 'never'

  return (
    <button disabled={busy} style={btn} title={meta.lastSyncError || auth.username || ''}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px]"
      onClick={async () => { setBusy(true); try { await api.sync(); await onRefresh() } finally { setBusy(false) } }}>
      <ArrowsClockwise size={12} weight="bold"
        className={busy ? 'animate-spin' : undefined} />
      <span className="num">{meta.lastSyncError ? 'error' : busy ? '…' : last}</span>
    </button>
  )
}
