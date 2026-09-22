import { useState } from 'react'
import { ArrowSquareOut, ArrowsClockwise, SignIn, Check, Warning } from '@phosphor-icons/react'
import * as api from '../api.js'
import TaskCard from './TaskCard.jsx'
import { STATUS } from '../scenes.js'

const ORDER = ['issues', 'qms', 'bom', 'planner']

/**
 * The four tools as one status list, then what each one has assigned to you.
 * One line per tool says where it stands; the button on the line is the one thing to do about it.
 */
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

  const rows = ORDER.map(key => {
    const s = sources[key]; if (!s) return null
    const mine = tasks.filter(t => t.source === key)
    const open = mine.filter(t => !t.done)
    const needsSignIn = s.kind === 'site' ? s.signedIn === false : (state.auth.configured && !state.auth.signedIn)
    const expired = s.kind === 'graph' && state.auth.signedIn && s.error === 'needs-signin'
    const adminWait = s.kind === 'graph' && s.error === 'needs-admin-consent'
    const problem = s.error && !['needs-signin', 'needs-admin-consent'].includes(s.error) ? s.error : null
    const last = s.lastSync ? new Date(s.lastSync).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : null
    let status, tone = 'var(--ink-3)'
    if (!s.available) status = 'Desktop app only'
    else if (problem) { status = problem; tone = STATUS.overdue }
    else if (adminWait) { status = 'Needs a one-time admin approval'; tone = STATUS.caution }
    else if (expired) { status = 'Microsoft 365 sign-in has expired'; tone = STATUS.caution }
    else if (needsSignIn) { status = s.kind === 'graph' ? 'Not connected' : 'Not signed in'; tone = STATUS.caution }
    else if (last) { status = `${open.length} assigned to ${who}${s.total != null ? ` of ${s.total}` : ''} · synced ${last}${s.stale ? ' · cached copy' : ''}`; tone = 'var(--ink-2)' }
    else status = 'Connected, not synced yet'
    return { key, s, mine, open, needsSignIn, expired, adminWait, problem, status, tone }
  }).filter(Boolean)

  const btn = 'pill flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-50'
  const dark = { background: 'var(--ink)', color: 'var(--bg)' }, line = { border: '1px solid var(--line-2)' }

  return (
    <main className="mx-auto col px-6">
      {!state.desktop && (
        <p className="panel mb-4 px-5 py-4 text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          You're running the web version. Issues, QMS and BOM need the desktop app, which holds a signed-in session to each tool. Planner works here.
        </p>
      )}

      <section className="panel px-6 py-2 sm:px-7">
        {rows.map(({ key, s, needsSignIn, expired, adminWait, problem, status, tone }, i) => (
          <div key={key} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3.5" style={{ borderTop: i ? '1px solid var(--line)' : 'none' }}>
            <div className="min-w-[200px]">
              <div className="display text-[18px] font-semibold leading-none">{s.label}.</div>
              <a href={s.origin} onClick={e => { e.preventDefault(); api.openExternal(s.origin) }} className="mt-1 inline-flex items-center gap-1 text-[13.5px] hover:underline" style={{ color: 'var(--ink-3)' }}>
                {s.origin.replace('https://', '')} <ArrowSquareOut size={11} />
              </a>
            </div>
            <div className="min-w-0 flex-1 text-[13.5px]" style={{ color: tone }}>
              <span className="inline-flex items-center gap-1.5">{problem || adminWait || expired ? <Warning size={13} weight="bold" /> : (!needsSignIn && s.available && s.lastSync) ? <Check size={13} weight="bold" color={STATUS.done} /> : null}{status}</span>
              {result[key] && <div className="mt-0.5 text-[13.5px]" style={{ color: result[key].startsWith('Failed') || result[key].startsWith('The tool') ? STATUS.caution : 'var(--ink-3)' }}>{result[key]}</div>}
            </div>
            <div className="flex items-center gap-2">
              {s.available && needsSignIn && s.kind === 'site' && <button disabled={busy === key} onClick={() => run(key, () => api.signInSource(key))} className={btn} style={dark}><SignIn size={13} weight="bold" /> Sign in</button>}
              {adminWait && <button onClick={onConnect} className={btn} style={line}><Warning size={13} weight="bold" /> Approval link</button>}
              {expired && <button onClick={async () => { await api.signOut(); await onRefresh(); onConnect() }} className={btn} style={dark}><SignIn size={13} weight="bold" /> Reconnect</button>}
              {s.available && needsSignIn && s.kind === 'graph' && <button onClick={onConnect} className={btn} style={dark}><SignIn size={13} weight="bold" /> Connect Microsoft 365</button>}
              {s.available && !needsSignIn && <button disabled={busy === key} onClick={() => run(key, () => api.syncSource(key))} className={btn} style={line}><ArrowsClockwise size={12} weight="bold" className={busy === key ? 'animate-spin' : ''} /> Sync</button>}
            </div>
          </div>
        ))}
        <p className="py-3 text-[13.5px]" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-3)' }}>Connected tools sync by themselves every two minutes. Matching uses the name and email in Settings.</p>
      </section>

      {rows.filter(r => r.open.length).map(({ key, s, open, mine }) => (
        <section key={key} className="panel mt-4 p-6 sm:p-7">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-[22px] font-semibold leading-none">{s.label}.</h2>
            <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{open.length} open{mine.length > open.length ? `, ${mine.length - open.length} done` : ''}</span>
          </div>
          <ul className="mt-4 flex flex-col gap-2">{open.map(t => <TaskCard key={t.id} task={t} onPatch={onPatch} onDelete={onDelete} draggable={false} />)}</ul>
        </section>
      ))}
      {rows.every(r => !r.open.length) && (
        <p className="mt-6 text-center text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Nothing across the tools is assigned to {who} right now.</p>
      )}
    </main>
  )
}
