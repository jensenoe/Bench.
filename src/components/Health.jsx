import { useEffect, useState } from 'react'
import { Check, Copy } from '@phosphor-icons/react'
import { getHealth, getDiagnostics } from '../api/extras.js'

/**
 * The health checks as a row of dots (Settings > This machine). Each check is a dot, its label and,
 * when it failed, one line on what is wrong. Check again asks the server to run them now; Copy
 * diagnostics puts the server's text and the desktop shell's facts on the clipboard for a bug report.
 */
export default function Health({ compact = false }) {
  const [h, setH] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(null)
  const load = async (force = false) => {
    setBusy(true)
    try { setH(await getHealth(force)) } catch (e) { setH({ ok: false, checks: [], error: e.message }) } finally { setBusy(false) }
  }
  useEffect(() => { load() }, [])
  const copy = async () => {
    try {
      const [text, shell] = await Promise.all([getDiagnostics().catch(e => `diagnostics: ${e.message}`), Promise.resolve(window.bench?.diagnostics?.()).catch(() => null)])
      const body = [text, shell ? `\n--- desktop ---\n${JSON.stringify(shell, null, 2)}` : ''].join('\n')
      await navigator.clipboard.writeText(body)
      setCopied('Copied.')
    } catch (e) { setCopied(`Could not copy: ${e.message}`) }
    setTimeout(() => setCopied(null), 3000)
  }
  const checks = h?.checks || []
  const bad = checks.filter(c => !c.ok)

  return (
    <div className={compact ? 'text-[13px]' : 'text-[13.5px]'}>
      {checks.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {checks.map(c => (
            <li key={c.key} className="inline-flex items-center gap-1.5" title={c.detail || ''}>
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.ok ? 'var(--ok)' : 'var(--late)' }} />
              <span style={{ color: c.ok ? 'var(--ink-2)' : 'var(--ink)' }}>{c.label}</span>
              <span className="sr-only">{c.ok ? 'fine' : 'failing'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: 'var(--ink-3)' }}>{h?.error ? `Could not run the checks: ${h.error}.` : busy ? 'Checking.' : 'Nothing to report yet.'}</p>
      )}
      {bad.length > 0 && !compact && (
        <ul className="mt-2 flex flex-col gap-1" style={{ color: 'var(--ink-3)' }}>
          {bad.map(c => <li key={c.key}><span style={{ color: 'var(--late)' }}>{c.label}.</span> {c.detail}</li>)}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={() => load(true)} disabled={busy} className="pill px-3.5 py-1.5 font-medium disabled:opacity-50" style={{ border: '1px solid var(--line-2)' }}>{busy ? 'Checking' : 'Check again'}</button>
        <button onClick={copy} className="inline-flex h-6 items-center gap-1.5 underline underline-offset-2" style={{ color: 'var(--ink-3)' }}>
          {copied === 'Copied.' ? <><Check size={12} weight="bold" /> Copied</> : <><Copy size={12} weight="bold" /> Copy diagnostics</>}
        </button>
        {copied && copied !== 'Copied.' && <span style={{ color: 'var(--caution)' }}>{copied}</span>}
        {h?.at && <span className="tnum" data-volatile style={{ color: 'var(--ink-3)' }}>Checked {new Date(h.at).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
    </div>
  )
}
