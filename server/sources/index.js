import { mergeSource, noteSourceError, patchSource, getMeta } from '../store.js'
import { syncFromPlanner } from '../planner.js'
import { bridge } from '../bridge.js'
import { getAccount } from '../auth.js'
import { fetchQms, ORIGIN as QMS } from './qms.js'
import { fetchBom, ORIGIN as BOM } from './bom.js'
import { fetchIssues, ORIGIN as ISSUES } from './issues.js'

/** Evaluated inside the sign-in window: true once the tool is usable on this session. */
const PROBES = {
  // cookie sessions: the API answers JSON instead of bouncing to a login page
  qms: `fetch('/api/tickets', { credentials: 'include' }).then(r => r.ok && (r.headers.get('content-type') || '').includes('json'))`,
  bom: `fetch('/', { credentials: 'include', redirect: 'follow' }).then(r => r.ok && r.url.startsWith(location.origin) && !/login|auth/i.test(r.url))`
}

export const SOURCES = {
  planner: { label: 'Phase Gate (Planner)', origin: 'https://innovation.tom.fit', kind: 'graph' },
  issues:  { label: 'Issue tickets',        origin: ISSUES, kind: 'graph' },
  qms:     { label: 'QMS',                  origin: QMS,    kind: 'site', probe: PROBES.qms },
  bom:     { label: 'Structured BOM',       origin: BOM,    kind: 'site', probe: PROBES.bom }
}

const FETCH = { issues: fetchIssues, qms: fetchQms, bom: fetchBom }

export async function syncSource(key) {
  if (key === 'planner') return syncFromPlanner()
  try {
    const r = await FETCH[key]()
    if (!r.ok) {
      noteSourceError(key, r.reason)
      if (r.reason === 'needs-signin') patchSource(key, { signedIn: false })
      return { ok: false, reason: r.reason }
    }
    const merged = mergeSource(key, r.items)
    // A successful read is the only reliable sign-in test: MSAL-in-page tools keep no cookie we can see.
    patchSource(key, { signedIn: true, total: r.total ?? null, stale: !!r.stale, error: null })
    return { ok: true, fetched: r.items.length, total: r.total ?? null, ...merged }
  } catch (err) {
    noteSourceError(key, err.message)
    return { ok: false, reason: err.message }
  }
}

export async function syncAll() {
  const out = {}
  for (const key of Object.keys(SOURCES)) out[key] = await syncSource(key)
  return out
}

/**
 * The background poll: only the tools that are actually connected. Graph sources need a signed-in
 * Microsoft account; cookie sources need a sync that has succeeded since sign-in. Anything else is
 * left alone, so an unconnected tool does not log an error every couple of minutes.
 */
export async function syncConnected() {
  const account = await getAccount().catch(() => null)
  const meta = getMeta().sources || {}
  const out = {}
  for (const [key, def] of Object.entries(SOURCES)) {
    const connected = def.kind === 'graph' ? Boolean(account) : (bridge.desktop && meta[key]?.signedIn === true)
    if (connected) out[key] = await syncSource(key)
  }
  return out
}

export async function sourceStatus() {
  const meta = getMeta().sources || {}
  const out = {}
  for (const [key, def] of Object.entries(SOURCES)) {
    const { probe: _probe, ...pub } = def
    out[key] = {
      ...pub, ...(meta[key] || {}),
      available: def.kind === 'graph' || bridge.desktop,
      // last sync result first; cookie presence only as a hint before the first sync
      signedIn: def.kind === 'graph' ? undefined
        : typeof meta[key]?.signedIn === 'boolean' ? meta[key].signedIn
        : (bridge.hasSession ? await bridge.hasSession(def.origin) : false)
    }
  }
  return out
}
