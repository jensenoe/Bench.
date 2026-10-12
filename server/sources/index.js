import { mergeSource, noteSourceError, patchSource, getMeta } from '../store.js'
import { syncFromPlanner } from '../planner.js'
import { bridge } from '../bridge.js'
import { getAccount } from '../auth.js'
import { fetchQms, ORIGIN as QMS } from './qms.js'
import { fetchBom, ORIGIN as BOM } from './bom.js'
import { fetchIssues, ORIGIN as ISSUES, PROBE as ISSUES_PROBE } from './issues.js'
import { fetchInnovation, ORIGIN as INNOVATION, PROBE as INNOVATION_PROBE } from './innovation.js'

/** Evaluated inside the sign-in window: true once the tool is usable on this session. */
const PROBES = {
  // cookie sessions: the API answers JSON instead of bouncing to a login page
  qms: `fetch('/api/tickets', { credentials: 'include' }).then(r => r.ok && (r.headers.get('content-type') || '').includes('json'))`,
  bom: `fetch('/', { credentials: 'include', redirect: 'follow' }).then(r => r.ok && r.url.startsWith(location.origin) && !/login|auth/i.test(r.url))`
}

export const SOURCES = {
  planner: { label: 'Phase Gate (Planner)', origin: 'https://innovation.tom.fit', kind: 'graph' },
  // read from the tool's own page in the signed-in window (roadmap 167); the SharePoint list is the fallback
  issues:  { label: 'Issue tickets',        origin: ISSUES, kind: 'site', probe: ISSUES_PROBE },
  qms:     { label: 'QMS',                  origin: QMS,    kind: 'site', probe: PROBES.qms },
  bom:     { label: 'Structured BOM',       origin: BOM,    kind: 'site', probe: PROBES.bom },
  // the dashboard page on the same origin as Phase Gate; shape discovered on the first sync (roadmap 117)
  innovation: { label: 'Innovation dashboard', origin: INNOVATION, kind: 'site', probe: INNOVATION_PROBE }
}

const FETCH = { issues: fetchIssues, qms: fetchQms, bom: fetchBom, innovation: fetchInnovation }

/**
 * Sign-ins that last (roadmap 174). A tool's own session cookie runs out long before the Microsoft sign-in
 * behind it does, and a plain fetch cannot walk the Microsoft redirect back (it ends on a page that posts a form
 * with script). So before a tool that read fine is marked needs-signin, the desktop opens it once in a hidden
 * window on the same session: when the Microsoft cookie is still good the redirect completes by itself and the
 * probe passes. Nothing is typed and nothing is shown; when Microsoft wants a person, it times out. Only for a tool
 * that was signed in, and at most every 30 minutes per tool, so a tool that really needs you is not retried in a loop.
 */
export const RENEW_EVERY_MS = 30 * 60_000
const renewedAt = new Map()
export async function renewSession(key, now = Date.now()) {
  const def = SOURCES[key]
  if (!def || def.kind !== 'site' || !def.probe || !bridge.desktop || typeof bridge.refreshSession !== 'function') return false
  if (getMeta().sources?.[key]?.signedIn !== true) return false
  if (now - (renewedAt.get(key) || 0) < RENEW_EVERY_MS) return false
  renewedAt.set(key, now)
  try {
    const ok = Boolean(await bridge.refreshSession(def.origin, def.probe))
    console.log(`[sync:${key}] session ${ok ? 'renewed silently' : 'not renewed, needs a sign-in'}`)
    return ok
  } catch (err) { console.warn(`[sync:${key}] renew failed:`, err.message); return false }
}

export async function syncSource(key) {
  if (key === 'planner') return syncFromPlanner()
  try {
    let r = await FETCH[key]()
    if (!r.ok && r.reason === 'needs-signin' && await renewSession(key)) r = await FETCH[key]()
    if (!r.ok) {
      noteSourceError(key, r.reason)
      if (r.reason === 'needs-signin') patchSource(key, { signedIn: false })
      return { ok: false, reason: r.reason }
    }
    const merged = mergeSource(key, r.items)
    // A successful read is the only reliable sign-in test: MSAL-in-page tools keep no cookie we can see.
    patchSource(key, { signedIn: true, total: r.total ?? null, stale: !!r.stale, error: null, ...(r.keys ? { keys: r.keys } : {}), ...(r.endpoints ? { endpoints: r.endpoints, via: r.via || null } : {}) })
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
