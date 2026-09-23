import { useEffect, useState } from 'react'
import { Copy, Check } from '@phosphor-icons/react'
import * as api from '../api.js'

/**
 * The Microsoft device-code sign-in, in one box. Used in Settings and on the first run.
 * Press the button: the Microsoft page opens, the code is on the clipboard, and this box
 * watches the server until the sign-in lands, then calls onDone.
 *
 * tier 'core' signs in for Planner and the hours workbook. tier 'extra' asks for the issue
 * list and the calendar too; those need a tenant admin once, and the box explains that.
 */
export default function Connect({ auth, onRefresh, tier = 'core', label = 'Connect', onDone, quiet = false, big = false, className = '' }) {
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState(null)
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [dots, setDots] = useState(0)

  const copy = async (text, set) => { try { await navigator.clipboard.writeText(text); set(true); setTimeout(() => set(false), 2500) } catch { set(false) } }
  const connect = async () => {
    setBusy(true)
    try {
      const c = await api.signIn(tier)
      setCode(c)
      if (c?.userCode) { copy(c.userCode, setCopied); api.openExternal(c.verificationUri) }
    } catch (e) { setCode({ error: e.message }) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (!code?.userCode) return
    const t = setInterval(async () => {
      setDots(d => d + 1)
      try {
        const st = await api.getState()
        const landed = tier === 'extra' ? st.auth?.extra?.granted : st.auth?.signedIn
        if (landed) { setCode(null); onRefresh?.(); api.sync().catch(() => {}); onDone?.() }
        else if (!st.auth?.pending && st.auth?.lastError) setCode({ error: st.auth.lastError })
      } catch { /* keep waiting */ }
      if (code.expiresAt && Date.now() > code.expiresAt) setCode({ error: 'The code expired. Press Connect for a new one.' })
    }, 3000)
    return () => clearInterval(t)
  }, [code, onRefresh, onDone, tier])

  const needsAdmin = code?.error && /admin/i.test(code.error)
  const pill = big ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : { background: 'var(--ink)', color: 'var(--bg)' }
  const pillCls = big ? 'pill px-6 py-3 text-[14px] font-medium disabled:opacity-60' : 'pill px-4 py-2 text-[13.5px] font-medium disabled:opacity-60'

  return (
    <div className={`${big ? 'text-[13.5px]' : 'text-[13.5px]'} ${className}`}>
      {!code?.userCode && (
        <button disabled={busy} className={pillCls} style={pill} onClick={connect}>{busy ? 'Starting' : label}</button>
      )}
      {code?.error && <p className="mt-2 leading-relaxed" style={{ color: 'var(--caution)' }}>{code.error}</p>}
      {needsAdmin && auth?.adminConsentUrl && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: 'var(--ink-3)' }}>
          <span>Send this to whoever administers tom.fit:</span>
          <button onClick={() => copy(auth.adminConsentUrl, setLinkCopied)} className="inline-flex items-center gap-1 underline underline-offset-2" style={{ color: 'var(--ink-2)' }}>
            {linkCopied ? <Check size={11} weight="bold" /> : <Copy size={11} weight="bold" />} {linkCopied ? 'Copied' : 'Copy the approval link'}
          </button>
        </p>
      )}
      {code?.userCode && (
        <div className="row mt-1 p-4">
          <p>A Microsoft sign-in page has opened in your browser. Enter this code there{copied ? ' (already on your clipboard)' : ''}:</p>
          <p className="tnum my-3 text-center text-[26px] font-medium tracking-[.25em]">{code.userCode}</p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1" style={{ color: 'var(--ink-3)' }}>
            <span>Waiting for Microsoft{'.'.repeat(1 + (dots % 3))}</span>
            <button className="underline underline-offset-2" onClick={() => api.openExternal(code.verificationUri)}>Open the page again</button>
            <button className="underline underline-offset-2" onClick={() => copy(code.userCode, setCopied)}>Copy the code</button>
            <button className="underline underline-offset-2" onClick={() => { setCode(null); onRefresh?.() }}>Cancel</button>
          </p>
        </div>
      )}
      {!quiet && !code?.userCode && (
        <p className="mt-2 leading-relaxed" style={{ color: 'var(--ink-3)' }}>
          {tier === 'core'
            ? 'Planner tasks in, hours out to the workbook. Asks for Tasks.ReadWrite and Files.ReadWrite; the issue list and the calendar come in a second step that needs an admin once.'
            : 'The issue-ticket list and today\'s meetings. Asks for Sites.Read.All and Calendars.Read, which a tenant admin has to approve once for the whole company.'}
        </p>
      )}
    </div>
  )
}
