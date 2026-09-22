import { useState } from 'react'
import * as api from '../api.js'

export default function SyncBar({ auth, meta, onRefresh }) {
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState(null)

  const btn = 'rounded-md border border-white/25 bg-white/10 px-2 py-1 text-[11px] text-white/90 backdrop-blur-sm'

  if (!auth.configured) {
    return <span className="rounded-md bg-black/25 px-2 py-1 text-[11px] text-white/85 backdrop-blur-sm" title="Set AZURE_CLIENT_ID in .env to enable Planner sync">
      Local only
    </span>
  }

  if (!auth.signedIn) {
    return (
      <>
        <button className={btn} disabled={busy} onClick={async () => {
          setBusy(true)
          try { setCode(await api.signIn()) } finally { setBusy(false) }
        }}>{busy ? 'Starting…' : 'Connect Planner'}</button>

        {code?.userCode && (
          <div className="absolute right-4 top-full z-20 mt-2 w-[290px] rounded-lg p-3 text-[12px] shadow-lg card-edge"
               style={{ background: 'var(--surface)', color: 'var(--ink)' }}>
            <p className="mb-2">Open <a className="underline" href={code.verificationUri} target="_blank" rel="noreferrer">
              {code.verificationUri}</a> and enter:</p>
            <p className="select-all rounded-md px-2 py-1.5 text-center font-mono text-[17px] tracking-widest"
               style={{ background: 'var(--surface-sunk)' }}>{code.userCode}</p>
            <button className="mt-2 text-[11px] underline" style={{ color: 'var(--ink-faint)' }}
              onClick={() => { setCode(null); onRefresh() }}>I've signed in</button>
          </div>
        )}
      </>
    )
  }

  const last = meta.lastSync ? new Date(meta.lastSync).toLocaleTimeString(undefined,
    { hour: '2-digit', minute: '2-digit' }) : 'never'

  return (
    <>
      <span className="rounded-md bg-black/25 px-2 py-1 text-[11px] text-white/85 backdrop-blur-sm" title={meta.lastSyncError || auth.username || ''}>
        {meta.lastSyncError ? 'Sync error' : `Synced ${last}`}
      </span>
      <button className={btn} disabled={busy} onClick={async () => {
        setBusy(true)
        try { await api.sync(); await onRefresh() } finally { setBusy(false) }
      }}>{busy ? 'Syncing…' : 'Sync'}</button>
    </>
  )
}
