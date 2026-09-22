import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PublicClientApplication, LogLevel } from '@azure/msal-node'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Credentials never go in the shared data folder. Electron points this at per-user storage.
const CACHE_FILE = path.join(process.env.BENCH_SECRETS_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data'), '.msal-cache.json')

// The TomFit app registration ("Project Management Tool"). A public client with device-code flow:
// the id is not a secret, so it ships with the app and an installed copy needs no .env at all.
// AZURE_CLIENT_ID / AZURE_TENANT_ID in .env still override it for another tenant.
const DEFAULT_CLIENT_ID = 'a2172323-3eb1-469b-aa74-f6817a93c8ee'
const DEFAULT_TENANT_ID = '62c8f2b6-19c3-4c76-ae91-ba4e4d2ee165'
const CLIENT_ID = process.env.AZURE_CLIENT_ID || DEFAULT_CLIENT_ID
const TENANT_ID = process.env.AZURE_TENANT_ID || DEFAULT_TENANT_ID
// Two tiers. CORE is what a user may consent to alone in the tom.fit tenant: Planner and the hours
// workbook. EXTRA (the SharePoint issue list, today's meetings) needs a one-time admin approval, so it
// is asked for separately and its absence never blocks the sign-in itself.
const g = s => s.startsWith('http') ? s : `https://graph.microsoft.com/${s}`
const CORE = ['Tasks.ReadWrite', 'Files.ReadWrite'].map(g)
const EXTRA = ['Sites.Read.All', 'Calendars.Read'].map(g)
const ENV_EXTRA = (process.env.GRAPH_SCOPES || '').split(/[,\s]+/).filter(Boolean).map(g).filter(s => !CORE.includes(s))
const SCOPES = [...new Set([...CORE, ...EXTRA, ...ENV_EXTRA])]
const EXTRA_ALL = [...new Set([...EXTRA, ...ENV_EXTRA])]

export const isConfigured = () => Boolean(CLIENT_ID)
export const scopes = () => SCOPES
/** Link for a tenant admin: one click grants the whole app for everyone in the tenant. */
export const adminConsentUrl = () => `https://login.microsoftonline.com/${TENANT_ID}/adminconsent?client_id=${CLIENT_ID}`

/**
 * Token cache on disk, so signing in survives a restart.
 * The refresh token lives here and never reaches the browser.
 */
const cachePlugin = {
  beforeCacheAccess: async (ctx) => {
    if (fs.existsSync(CACHE_FILE)) {
      ctx.tokenCache.deserialize(fs.readFileSync(CACHE_FILE, 'utf8'))
    }
  },
  afterCacheAccess: async (ctx) => {
    if (ctx.cacheHasChanged) {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true })
      fs.writeFileSync(CACHE_FILE, ctx.tokenCache.serialize(), 'utf8')
      try { fs.chmodSync(CACHE_FILE, 0o600) } catch { /* best effort on Windows */ }
    }
  }
}

let pca = null
function client() {
  if (!isConfigured()) throw new Error('AZURE_CLIENT_ID is not set')
  if (pca) return pca
  pca = new PublicClientApplication({
    auth: {
      clientId: CLIENT_ID,
      authority: `https://login.microsoftonline.com/${TENANT_ID}`
    },
    cache: { cachePlugin },
    system: {
      loggerOptions: {
        loggerCallback: (lvl, msg) => { if (lvl <= LogLevel.Error) console.error('[msal]', msg) },
        piiLoggingEnabled: false,
        logLevel: LogLevel.Error
      }
    }
  })
  return pca
}

/** Current device-code prompt, if a sign-in is mid-flight. */
let pendingDeviceCode = null
export const getPendingDeviceCode = () => pendingDeviceCode

export async function getAccount() {
  if (!isConfigured()) return null
  const accounts = await client().getTokenCache().getAllAccounts()
  return accounts[0] || null
}

/**
 * Token from cache only, never prompting. tier 'core' is Planner and the workbook; tier 'extra' adds
 * the issue list and the calendar and comes back null until an admin has approved those.
 */
let extraState = { checked: false, granted: false, reason: null }
export const extraStatus = () => extraState
export async function getTokenSilent(tier = 'core') {
  if (process.env.BENCH_TEST_TOKEN) return process.env.BENCH_TEST_TOKEN   // local tests against a mock Graph only
  const account = await getAccount()
  if (!account) return null
  const scopes = tier === 'extra' ? [...CORE, ...EXTRA_ALL] : CORE
  try {
    const res = await client().acquireTokenSilent({ account, scopes })
    if (tier === 'extra') extraState = { checked: true, granted: true, reason: null }
    return res?.accessToken || null
  } catch (err) {
    if (tier === 'extra') extraState = { checked: true, granted: false, reason: /consent|AADSTS65001|AADSTS90094|admin/i.test(String(err?.errorCode || err?.message)) ? 'needs-admin-consent' : 'unavailable' }
    return null
  }
}

/** Starts device-code sign-in. Resolves with the code to show; the token lands in the cache when the user finishes. */
let lastSignInError = null
export const getLastSignInError = () => lastSignInError
export async function signIn({ tier = 'core' } = {}) {
  if (!isConfigured()) throw new Error('AZURE_CLIENT_ID is not set')
  if (pendingDeviceCode && pendingDeviceCode.expiresAt > Date.now()) return { alreadyPending: true, ...pendingDeviceCode }
  pendingDeviceCode = null
  lastSignInError = null

  let failed = null
  const promise = client().acquireTokenByDeviceCode({
    scopes: tier === 'extra' ? [...CORE, ...EXTRA_ALL] : CORE,
    deviceCodeCallback: (res) => {
      if (!res?.userCode) return
      pendingDeviceCode = {
        userCode: res.userCode,
        verificationUri: res.verificationUri || 'https://microsoft.com/devicelogin',
        message: res.message,
        expiresAt: Date.now() + (res.expiresIn ?? 900) * 1000
      }
      console.log('\n[auth] ' + res.message + '\n')
    }
  })

  promise
    .then(() => { pendingDeviceCode = null; if (tier === 'extra') extraState = { checked: true, granted: true, reason: null } })
    .catch(err => { pendingDeviceCode = null; failed = err; lastSignInError = friendlyError(err); console.error('[auth] sign-in failed:', err.message) })

  // Wait for MSAL to hand over the code (usually well under a second, longer on a slow link),
  // but give up after ten seconds or as soon as the request itself fails.
  const until = Date.now() + 10000
  while (!pendingDeviceCode && !failed && Date.now() < until) await new Promise(r => setTimeout(r, 150))
  if (pendingDeviceCode) return pendingDeviceCode
  if (failed) return { error: friendlyError(failed) }
  return { error: 'Microsoft did not answer in time. Try again.' }
}
function friendlyError(err) {
  const m = String(err?.message || err), code = String(err?.errorCode || '')
  if (/network|ENOTFOUND|ECONN|post_request_failed/i.test(m)) return 'Could not reach Microsoft. Check the network and try again.'
  if (/AADSTS65001|AADSTS90094|consent_required|admin/i.test(m + code)) return 'Microsoft wants an admin to approve the app first. The link for that is below.'
  if (/AADSTS70016|authorization_pending|expired_token|AADSTS70020/i.test(m + code)) return 'The code expired before the sign-in finished. Press Connect for a new one.'
  return m.split('\n')[0].slice(0, 200)
}

export async function signOut() {
  if (!isConfigured()) return
  const cache = client().getTokenCache()
  for (const acc of await cache.getAllAccounts()) await cache.removeAccount(acc)
  if (fs.existsSync(CACHE_FILE)) fs.rmSync(CACHE_FILE)
  pca = null
  pendingDeviceCode = null
  extraState = { checked: false, granted: false, reason: null }
}
