import { useState } from 'react'
import { ArrowSquareOut, ArrowsClockwise, SignIn, Check, Warning } from '@phosphor-icons/react'
import * as api from '../api.js'
import TaskCard from './TaskCard.jsx'
import { STATUS } from '../scenes.js'

const ORDER = ['issues', 'qms', 'bom', 'planner']

/** Everything assigned to you across the four tools, grouped by tool, with connection state. */
export default function Tools({ state, onPatch, onDelete, onRefresh, onConnect }) {
  const [busy, setBusy] = useState(null)
  const [result, setResult] = useState({})   // key -> one line about the last sync you clicked
  const sources = state.sources || {}
  const tasks = state.tasks
  const who = (state.settings?.name || '').split(/\s+/)[0] || 'you'

  const describe = (r) => {
    if (!r) return null
    if (!r.ok) return r.reason === 'needs-signin' ? (sources[r.source]?.kind === 'graph' ? 'Connect Microsoft 365 first.' : 'The tool wants a sign-in.')
      : r.reason === 'needs-admin-consent' ? 'Waiting on an admin to approve the app for the issue list.'
      : r.reason === 'timeout' ? 'The tool did not answer in time.' : `Failed: ${r.reason}`
    const total = r.total != null ? `${r.total} in the tool, ` : ''
    return `${total}${r.fetched} assigned to ${who}${r.added ? `, ${r.added} new` : ''}${r.closed ? `, ${r.closed} closed upstream` : ''}.`
  }
  const run = async (key, fn) => {
    setBusy(key)
    try { const r = await fn(); setResult(x => ({ ...x, [key]: describe(r) })); await onRefresh() }
    catch (e) { setResult(x => ({ ...x, [key]: `Failed: ${e.message}` })) }
    finally { setBusy(null) }
  }

  return (
    <main className="mx-auto col px-6">
      {!state.desktop && (
        <p className="panel mb-4 px-5 py-4 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          You're running the web version. Issues, QMS and BOM need the desktop app, which holds a signed-in session to each tool. Planner works here.
        </p>
      )}
      <div className="flex flex-col gap-4">
        {ORDER.map(key => {
          const s = sources[key]; if (!s) return null
          const mine = tasks.filter(t => t.source === key)
          const open = mine.filter(t => !t.done)
          const needsSignIn = s.kind === 'site' ? s.signedIn === false : (state.auth.configured && !state.auth.signedIn)
          // signed in on paper, but Graph said no: the refresh token has gone stale
          const expired = s.kind === 'graph' && state.auth.signedIn && s.error === 'needs-signin'
          const adminWait = s.kind === 'graph' && s.error === 'needs-admin-consent'
          const problem = s.error && !['needs-signin', 'needs-admin-consent'].includes(s.error) ? s.error : null
          const last = s.lastSync ? new Date(s.lastSync).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : null
          return (
            <section key={key} className="panel p-6 sm:p-7">
              <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="display text-[24px] font-semibold leading-none">{s.label}.</h2>
                  <p className="mt-2 flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                    <a href={s.origin} onClick={e => { e.preventDefault(); api.openExternal(s.origin) }} className="inline-flex items-center gap-1 hover:underline">
                      {s.origin.replace('https://', '')} <ArrowSquareOut size={11} />
                    </a>
                    {last && <span>· synced {last}</span>}
                    {s.total != null && <span className="tnum">· {s.total} in the tool, {open.length} assigned to {who}</span>}
                    {s.stale && <span style={{ color: STATUS.caution }}>· cached copy</span>}
                  </p>
                  {result[key] && <p className="mt-1.5 text-[12.5px]" style={{ color: result[key].startsWith('Failed') || result[key].startsWith('The tool') ? STATUS.caution : 'var(--ink-2)' }}>{result[key]}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {problem && <span className="flex items-center gap-1.5 text-[12px]" style={{ color: STATUS.overdue }}><Warning size={13} weight="bold" /> {problem}</span>}
                  {s.available && needsSignIn && s.kind === 'site' && (
                    <button disabled={busy === key} onClick={() => run(key, () => api.signInSource(key))}
                      className="pill flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-medium" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
                      <SignIn size={13} weight="bold" /> Sign in
                    </button>
                  )}
                  {adminWait && (
                    <button onClick={onConnect} className="pill flex items-center gap-1.5 px-4 py-2 text-[12.5px]" style={{ border: '1px solid var(--line-2)', color: 'var(--ink-2)' }}>
                      <Warning size={13} weight="bold" /> Needs admin approval
                    </button>
                  )}
                  {expired && (
                    <button onClick={async () => { await api.signOut(); await onRefresh(); onConnect() }} className="pill flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-medium" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
                      <SignIn size={13} weight="bold" /> Reconnect Microsoft 365
                    </button>
                  )}
                  {s.available && !needsSignIn && (
                    <button disabled={busy === key} onClick={() => run(key, () => api.syncSource(key))}
                      className="pill flex items-center gap-1.5 px-3.5 py-2 text-[12.5px]" style={{ border: '1px solid var(--line-2)' }}>
                      <ArrowsClockwise size={12} weight="bold" className={busy === key ? 'animate-spin' : ''} /> Sync
                    </button>
                  )}
                  {s.available && needsSignIn && s.kind === 'graph' && (
                    <button onClick={onConnect} className="pill flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-medium" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
                      <SignIn size={13} weight="bold" /> Connect Microsoft 365
                    </button>
                  )}
                  {!s.available && <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>Desktop only</span>}
                </div>
              </header>

              {open.length > 0 ? (
                <ul className="mt-5 flex flex-col gap-2">{open.map(t => <TaskCard key={t.id} task={t} onPatch={onPatch} onDelete={onDelete} />)}</ul>
              ) : (
                <p className="mt-5 flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                  {s.lastSync ? <><Check size={13} weight="bold" color={STATUS.done} /> Nothing here is assigned to {who} right now{s.total != null ? ` (${s.total} in the tool)` : ''}. Matching uses the name and email in Settings.</>
                    : needsSignIn ? 'Sign in once. SSO does the rest, and the session is kept.' : 'Not synced yet. Sync reads the tool on the kept session.'}
                </p>
              )}
              {mine.length > open.length && <p className="mt-3 text-[11.5px]" style={{ color: 'var(--ink-3)' }}>{mine.length - open.length} completed</p>}
            </section>
          )
        })}
      </div>
    </main>
  )
}
