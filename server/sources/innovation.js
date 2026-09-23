/**
 * The Innovation dashboard (roadmap 117): https://innovation.tom.fit/dashboard.html, behind the tom.fit
 * sign-in, shape unknown. The sync discovers it in two stages, inside the desktop's signed-in window:
 *
 *   1. The page is loaded with bridge.runInSite and asked two things: which same-origin JSON endpoints it
 *      called (performance resource entries of type fetch or xhr), and which rows or cards on the page name
 *      the user (table rows, list items, articles, [role=row], .card), each as { text, href, id, title }.
 *   2. Every endpoint is fetched with the session. When one answers an array of objects (or holds one under
 *      data, items, results or value) whose objects have a title-like and an assignee-like field, the objects
 *      assigned to the user become items. The DOM rows are the fallback when no endpoint fits.
 *
 * The result carries `keys` (field names seen) and `endpoints` (URLs seen), so the source diagnostics show
 * the real shape after the first sync and the mapping can be tightened from evidence, not guesses.
 * The Phase Gate source ('planner') uses the same origin through Graph; it stays as it is.
 */
import { bridge } from '../bridge.js'
import * as settings from '../settings.js'

export const ORIGIN = 'https://innovation.tom.fit'
export const PAGE = `${ORIGIN}/dashboard.html`
/** Evaluated in the sign-in window: the page loads and is not the login form. */
export const PROBE = `fetch('/dashboard.html', { credentials: 'include' }).then(r => r.ok && !/login/i.test(r.url))`

const TITLE_KEYS = ['title', 'name', 'subject', 'summary', 'titel', 'bezeichnung', 'thema']
const ASSIGNEE_KEYS = ['assignee', 'assigned_to', 'assignedto', 'owner', 'responsible', 'verantwortlich', 'zustaendig', 'zuständig', 'bearbeiter', 'assignees', 'members']
const STATUS_KEYS = ['status', 'state', 'phase', 'stage', 'gate', 'zustand']
const DATE_KEYS = ['dueDate', 'due_date', 'due', 'deadline', 'target', 'targetDate', 'target_date', 'faellig', 'fällig', 'termin', 'enddate', 'end_date', 'end']
const ID_KEYS = ['id', 'key', 'uid', 'number', 'nr', 'code', 'slug']
const URL_KEYS = ['url', 'href', 'link', 'permalink', 'web_url', 'webUrl']
const DONE = /^(done|closed|complete|completed|erledigt|abgeschlossen|fertig|geschlossen|archived|archiviert|resolved)$/i
const CONTAINER_KEYS = ['data', 'items', 'results', 'value', 'rows', 'records', 'list', 'projects', 'ideas', 'tasks', 'cards', 'entries']

// ── matching the user ─────────────────────────────────────────────────
const strip = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/**
 * Does a value (a string, or an object or array of people) name the user? Full name, surname of three letters
 * or more, the email or its local part, all case- and diacritic-insensitive. The same rules as settings.isMe,
 * with the user passed in so the mapping is testable without Settings.
 */
export function matchesUser(value, user = {}) {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.some(v => matchesUser(v, user))
  if (typeof value === 'object') return Object.values(value).some(v => (typeof v === 'string' || Array.isArray(v) || (v && typeof v === 'object')) && matchesUser(v, user))
  const t = strip(value)
  if (!t) return false
  const parts = strip(user.name).split(/\s+/).filter(Boolean)
  const email = strip(user.email)
  const local = email.split('@')[0]
  if (!parts.length && !email) return false
  if (parts.length && t.includes(parts.join(' '))) return true
  const last = parts.length > 1 ? parts.at(-1) : null
  if (last && last.length >= 3 && new RegExp(`(?<![a-z])${last}(?![a-z])`).test(t)) return true
  if (email && t.includes(email)) return true
  if (local && local.length >= 3 && new RegExp(`(?<![a-z0-9])${local}(?![a-z0-9])`).test(t)) return true
  if (parts.length > 1 && new RegExp(`(?<![a-z])${parts[0]}\\s+${last[0]}\\b`).test(t)) return true
  return false
}

// ── stage two: JSON ───────────────────────────────────────────────────
const lowerKeys = obj => Object.fromEntries(Object.keys(obj).map(k => [k.toLowerCase(), k]))
/** The first present key from a list, matched case-insensitively; the real key name comes back. */
const findKey = (obj, wanted) => { const lk = lowerKeys(obj); for (const w of wanted) { const k = lk[w.toLowerCase()]; if (k !== undefined && obj[k] !== null && obj[k] !== undefined && obj[k] !== '') return k } return null }
const asText = v => v === null || v === undefined ? null : typeof v === 'object' ? (v.name || v.title || v.label || v.displayName || v.email || null) : String(v)
const asDate = v => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) }

/** The array of objects inside a JSON answer: the answer itself, or the first array under a known container key. */
export function extractArray(json) {
  if (Array.isArray(json)) return json.filter(x => x && typeof x === 'object' && !Array.isArray(x))
  if (!json || typeof json !== 'object') return []
  for (const k of CONTAINER_KEYS) if (Array.isArray(json[k])) return extractArray(json[k])
  for (const v of Object.values(json)) if (Array.isArray(v) && v.length && typeof v[0] === 'object') return extractArray(v)
  return []
}

/**
 * Objects with a title-like and an assignee-like field, assigned to the user, as source items. `fits` says
 * whether the array had the two fields at all, so the caller can tell "no API fits" from "nothing assigned".
 */
export function mapApi(json, user, endpoint = null) {
  const rows = extractArray(json)
  const keys = new Set()
  for (const r of rows) for (const k of Object.keys(r)) keys.add(k)
  const sample = rows.find(r => findKey(r, TITLE_KEYS)) || null
  const titleKey = sample ? findKey(sample, TITLE_KEYS) : null
  const assigneeKey = rows.map(r => findKey(r, ASSIGNEE_KEYS)).find(Boolean) || null
  const fits = Boolean(titleKey && assigneeKey)
  if (!fits) return { fits: false, items: [], total: rows.length, keys: [...keys].sort() }
  const items = rows.filter(r => matchesUser(r[findKey(r, ASSIGNEE_KEYS) || assigneeKey], user)).map((r, i) => {
    const idKey = findKey(r, ID_KEYS), statusKey = findKey(r, STATUS_KEYS), dateKey = findKey(r, DATE_KEYS), urlKey = findKey(r, URL_KEYS)
    const id = idKey ? String(r[idKey]) : `${endpoint || 'api'}#${i}`
    const status = statusKey ? asText(r[statusKey]) : null
    const rawUrl = urlKey ? String(r[urlKey]) : null
    const url = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `${ORIGIN}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`) : PAGE
    const meta = {}
    for (const k of Object.keys(r)) { const v = r[k]; if (k !== titleKey && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') && String(v).length <= 200) meta[k] = v }
    return {
      sourceId: id, title: String(asText(r[findKey(r, TITLE_KEYS) || titleKey]) || '').replace(/\s+/g, ' ').trim().slice(0, 140),
      status, done: Boolean(status && DONE.test(status)) || r.done === true || r.completed === true,
      dueDate: dateKey ? asDate(r[dateKey]) : null, url, group: 'Innovation', subgroup: status || null,
      meta: { ...meta, endpoint: endpoint || null }
    }
  }).filter(x => x.title)
  return { fits: true, items, total: rows.length, keys: [...keys].sort() }
}

// ── stage one: the page ───────────────────────────────────────────────
/**
 * Runs inside dashboard.html. Collects the same-origin JSON endpoints the page called and every row or card
 * whose text names the user. Returns { url, title, endpoints, rows: [{ text, href, id, title }], loginForm }.
 */
export const pageScript = (user) => `(() => {
  const user = ${JSON.stringify({ name: user.name || '', email: user.email || '' })}
  const strip = s => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase()
  const parts = strip(user.name).split(/\\s+/).filter(Boolean), email = strip(user.email), local = email.split('@')[0]
  const last = parts.length > 1 ? parts[parts.length - 1] : null
  const mentions = (t) => {
    t = strip(t)
    if (parts.length && t.includes(parts.join(' '))) return true
    if (last && last.length >= 3 && new RegExp('(?<![a-z])' + last + '(?![a-z])').test(t)) return true
    if (email && t.includes(email)) return true
    if (local && local.length >= 3 && new RegExp('(?<![a-z0-9])' + local + '(?![a-z0-9])').test(t)) return true
    return false
  }
  const endpoints = [...new Set(performance.getEntriesByType('resource')
    .filter(e => (e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest') && e.name.startsWith(location.origin))
    .map(e => e.name))].filter(u => !/\\.(js|css|png|jpg|jpeg|svg|gif|woff2?|ico|map)(\\?|$)/i.test(u))
  const els = [...document.querySelectorAll('tr, li, article, [role=row], .card')]
  const rows = []
  const seen = new Set()
  for (const el of els) {
    if (el.querySelector('tr, li, article, [role=row], .card')) continue   // the leaf, not its container
    const text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim()
    if (!text || text.length > 600 || !mentions(text)) continue
    const key = text.slice(0, 200); if (seen.has(key)) continue; seen.add(key)
    const a = el.matches('a[href]') ? el : el.querySelector('a[href]')
    const head = el.querySelector('h1, h2, h3, h4, h5, h6, th, td, .title, [class*=title], strong, b')
    rows.push({ text: text.slice(0, 600), href: a ? a.href : null, id: el.id || el.dataset.id || el.dataset.key || el.getAttribute('data-row-id') || null, title: (head ? (head.innerText || head.textContent) : text).replace(/\\s+/g, ' ').trim().slice(0, 140) })
    if (rows.length >= 200) break
  }
  return { url: location.href, title: document.title, endpoints, rows, loginForm: Boolean(document.querySelector('input[type=password]')) || /login/i.test(location.href) }
})()`

/** DOM rows as source items: the fallback when no endpoint fits. */
export function mapDom(result) {
  const rows = Array.isArray(result?.rows) ? result.rows : []
  return rows.filter(r => r && (r.title || r.text)).map((r, i) => ({
    sourceId: r.id || r.href || `dom#${i}:${String(r.title || r.text).slice(0, 60)}`,
    title: String(r.title || r.text).replace(/\s+/g, ' ').trim().slice(0, 140),
    status: null, done: false, dueDate: null, url: r.href || PAGE, group: 'Innovation', subgroup: null,
    meta: { text: String(r.text || '').slice(0, 300), from: 'page' }
  }))
}

// ── the sync ──────────────────────────────────────────────────────────
export async function fetchInnovation({ user = { name: settings.get().name, email: settings.get().email } } = {}) {
  if (!bridge.desktop || !bridge.runInSite) return { ok: false, reason: 'desktop-only' }
  let page
  try { page = await bridge.runInSite(PAGE, pageScript(user)) }
  catch (err) { return { ok: false, reason: /timeout/i.test(err.message) ? 'timeout' : err.message } }
  if (!page || page.loginForm || /login\.microsoftonline|\/login/i.test(page.url || '')) return { ok: false, reason: 'needs-signin' }

  const endpoints = (page.endpoints || []).slice(0, 12)
  const keys = new Set()
  const tried = []
  let items = null
  for (const url of endpoints) {
    try {
      const r = await bridge.fetchWithSession(url, { headers: { accept: 'application/json' } })
      if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) { tried.push({ url, ok: false, status: r.status }); continue }
      const mapped = mapApi(await r.json(), user, url)
      mapped.keys.forEach(k => keys.add(k))
      tried.push({ url, ok: true, fits: mapped.fits, rows: mapped.total })
      if (mapped.fits) { items = [...(items || []), ...mapped.items] }
    } catch (err) { tried.push({ url, ok: false, error: err.message }) }
  }
  const fromApi = items !== null
  const out = fromApi ? items : mapDom(page)
  // One id per item even when two endpoints return the same object.
  const unique = [...new Map(out.map(x => [x.sourceId, x])).values()]
  return {
    ok: true, items: unique, total: unique.length, via: fromApi ? 'api' : 'page',
    keys: [...keys].sort().slice(0, 80), endpoints: tried.map(t => t.url), tried, pageTitle: page.title || null, domRows: (page.rows || []).length
  }
}
