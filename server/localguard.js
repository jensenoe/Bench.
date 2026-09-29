/**
 * Only this machine may talk to the local server, and only Bench. itself may change anything.
 *
 * The server listens on 127.0.0.1, which keeps the network out but not the browser: any web page open in
 * Chrome can send requests to 127.0.0.1:<port>. Two attacks follow from that, and this middleware closes both.
 *
 *   DNS rebinding   a page on attacker.example re-points its own name to 127.0.0.1 and then reads the API
 *                   as if it were same-origin. The request still carries `Host: attacker.example`, so every
 *                   request whose Host is not a loopback name is refused.
 *   Drive-by writes a page POSTs to /api/timeclock/reset or /api/auth/signout without reading the answer
 *                   (a "simple" request needs no CORS preflight). Browsers mark such requests with an Origin
 *                   and with Sec-Fetch-Site: cross-site, so a state-changing request from a foreign origin is
 *                   refused, and any /api request the browser itself labels cross-site is refused too.
 *
 * Requests without Origin or Sec-Fetch-Site (the MCP script, the phone view's proxy, the tests, curl) are
 * local processes and pass. The Vite dev server on another loopback port passes: its origin is loopback.
 */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

/** The hostname of a Host header or an origin URL, lower-cased, without the port. Null when unparseable. */
export function hostnameOf(value, { origin = false } = {}) {
  if (!value || typeof value !== 'string') return null
  try {
    const u = new URL(origin ? value : `http://${value}`)
    return u.hostname.toLowerCase()
  } catch { return null }
}
export const isLoopback = (hostname) => hostname != null && LOOPBACK.has(hostname)

/** Why a request is refused, or null when it may pass. Pure, so the tests can walk every case. */
export function refusal({ method = 'GET', path = '/', host, origin, secFetchSite } = {}) {
  if (!isLoopback(hostnameOf(host))) return 'host'
  const isApi = path.startsWith('/api')
  if (secFetchSite === 'cross-site' && (isApi || !SAFE.has(method))) return 'cross-site'
  if (!SAFE.has(method) && origin !== undefined && origin !== null) {
    // `Origin: null` comes from sandboxed frames and file:// pages: foreign by definition
    if (origin === 'null' || !isLoopback(hostnameOf(origin, { origin: true }))) return 'origin'
  }
  return null
}

export function localGuard({ log = (msg) => console.warn(msg) } = {}) {
  return (req, res, next) => {
    const why = refusal({ method: req.method, path: req.path, host: req.headers.host, origin: req.headers.origin, secFetchSite: req.headers['sec-fetch-site'] })
    if (!why) return next()
    log(`[guard] refused ${req.method} ${req.path} (${why}: host=${req.headers.host || '-'} origin=${req.headers.origin || '-'})`)
    res.status(403).json({ error: 'Only Bench. on this machine may use this server.' })
  }
}
