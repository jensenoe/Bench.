/**
 * Issue tickets (issues.tom.fit). Since autumn 2026 the tool keeps its tickets and their "in charge" in its own
 * database; the SharePoint list behind it is the old trial copy, where about half the tickets have nobody in
 * charge. So the desktop reads what the tool itself shows (roadmap 167): issues.tom.fit opens in the signed-in
 * window and hands over its own ticket list (the page's `allTickets`), mapped below. The tool keeps its Microsoft
 * sign-in in local storage, so one sign-in in Bench. lasts. Without the desktop, or when the page gives nothing,
 * the SharePoint list through Graph is the fallback, as before.
 *
 *   site  netorgft10707311.sharepoint.com,ae25541d-…,f2e21d90-…
 *   list  635ea462-3c0a-4036-82da-3d28e2e1de63
 *
 * "incharge" (shown as "responsible") is a person column. With an explicit $select Graph returns the person's
 * display name as plain text; without it only inchargeLookupId comes back.
 */
import { getTokenSilent, getAccount } from '../auth.js'
import { isMe } from '../settings.js'
import { bridge } from '../bridge.js'

export const ORIGIN = 'https://issues.tom.fit'
export const SITE = process.env.ISSUES_SITE_ID || 'netorgft10707311.sharepoint.com,ae25541d-01d9-40fd-9235-46244cdae5cf,f2e21d90-c59a-4062-be3f-28a9cb960c1b'
export const LIST = process.env.ISSUES_LIST_ID || '635ea462-3c0a-4036-82da-3d28e2e1de63'
/** The site's address and the list's name, as the issue tool itself configures them; for the admin's list grant. */
export const SITE_URL = process.env.ISSUES_SITE_URL || 'https://netorgft10707311.sharepoint.com/sites/tom.fit'
export const LIST_NAME = 'hardware issues (trial)'
const FIELDS = ['id', 'Title', 'status', 'Hub', 'Priority', 'Issuearea', 'SN_x0023_', 'incharge', 'Author', 'Created', 'Modified', 'Solvedon']
const DONE = new Set(['resolved', 'closed', 'done', 'erledigt', 'abgeschlossen'])

// ── the tool's own page (roadmap 167) ─────────────────────────────────
export const PAGE = `${ORIGIN}/`
/** In the sign-in window: true once the tool has loaded its tickets on this session. */
export const PROBE = `(typeof allTickets !== 'undefined' && Array.isArray(allTickets) && allTickets.length > 0)`
/**
 * Runs in issues.tom.fit: waits up to 40 s for the page to load its tickets, then returns a plain copy of the
 * fields Bench. needs, or { signin: true } when the page is waiting for a sign-in. Nothing is written.
 */
export const pageScript = `new Promise((resolve) => {
  const started = Date.now()
  const tick = () => {
    const list = (typeof allTickets !== 'undefined' && Array.isArray(allTickets)) ? allTickets : null
    if (list && list.length) {
      const num = t => { try { return typeof ticketDisplayNumber === 'function' ? String(ticketDisplayNumber(t)) : String(t.ticketNumber || t.id) } catch { return String(t.id) } }
      const out = list.map(t => ({ id: String(t.id), number: num(t), title: t.title || '', status: t.status || '', priority: t.priority || null, issueType: t.issueType || null,
        machine: t.machine || null, location: t.location || null, reporter: t.reporter || null, assignedTo: t.assignedTo || '', created: t.created || null, modified: t.modified || null }))
      return resolve({ tickets: out, url: location.href })
    }
    const text = (document.body && document.body.innerText || '').toLowerCase()
    const signin = /sign in|anmelden|log in/.test(text) && !(list && list.length)
    if (Date.now() - started > 40000) return resolve({ tickets: [], signin, url: location.href })
    setTimeout(tick, 700)
  }
  tick()
})`
const splitNames = s => String(s || '').split(/[,;]/).map(x => x.trim()).filter(Boolean)
/** The page's tickets as source items: everything counted, yours returned (pure, tested). */
export function mapPageTickets(tickets = [], me = isMe) {
  const all = tickets.filter(t => t && t.id)
  const mine = all.filter(t => me(t.assignedTo || ''))
  return {
    total: all.length,
    items: mine.map(t => ({
      sourceId: String(t.number || t.id),
      title: `#${t.number || t.id}  ${String(t.title || '').replace(/\s+/g, ' ').trim()}`,
      status: String(t.status || '').trim(), done: DONE.has(String(t.status || '').trim().toLowerCase()),
      dueDate: null, url: `${ORIGIN}/#ticket/${encodeURIComponent(t.number || t.id)}`,
      group: 'Issues', subgroup: t.location || null,
      meta: { hub: t.location || null, machine: t.machine || null, priority: t.priority || null, type: t.issueType || null, reporter: t.reporter || null, from: t.reporter || null, with: splitNames(t.assignedTo).filter(n => !me(n)) }
    }))
  }
}

async function graphAll(token, url) {
  const out = []
  let next = url
  while (next) {
    const res = await fetch(next, { headers: { Authorization: `Bearer ${token}`, Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Graph ${res.status} ${body.slice(0, 200)}`)
    }
    const page = await res.json()
    out.push(...(page.value || []))
    next = page['@odata.nextLink'] || null
  }
  return out
}

const people = (v) => Array.isArray(v) ? v : v ? [v] : []
// Graph gives a person column as plain text ("Roman Dosch") when the fields are $select-ed, as an object with
// LookupValue and Email otherwise; both count (roadmap 167: plain names were dropped, so nothing matched you)
const names = (v) => people(v).map(p => typeof p === 'string' ? p : (p?.LookupValue || p?.Email || '')).map(s => String(s).trim()).filter(Boolean)

export async function fetchIssues() {
  // The tool's own page first: it holds the real "in charge" (roadmap 167)
  if (bridge.desktop && bridge.runInSite) {
    let page = null
    try { page = await bridge.runInSite(PAGE, pageScript, { timeoutMs: 50000 }) } catch { page = null }
    if (page?.tickets?.length) { const m = mapPageTickets(page.tickets); return { ok: true, total: m.total, items: m.items, via: 'page' } }
    // no tickets on the page means it is waiting for a sign-in (or failed to load): ask for one rather than fall
    // back to the trial list, whose missing in-charge would quietly show nothing as yours
    return { ok: false, reason: 'needs-signin' }
  }
  return fetchFromList()
}

/** The SharePoint list through Graph: the fallback, with the trial list's gaps. */
async function fetchFromList() {
  const token = await getTokenSilent('extra')
  if (!token) return { ok: false, reason: (await getAccount()) ? 'needs-admin-consent' : 'needs-signin' }

  const url = `https://graph.microsoft.com/v1.0/sites/${SITE}/lists/${LIST}/items?$top=200&$expand=fields($select=${FIELDS.join(',')})`
  const rows = await graphAll(token, url)

  const tickets = rows.map(r => {
    const f = r.fields || {}
    const assignees = names(f.incharge)
    return {
      id: String(f.id || r.id), title: f.Title || '', status: String(f.status || '').trim(),
      assignees, assigneeEmails: people(f.incharge).map(p => p?.Email || '').filter(Boolean),
      hub: f.Hub || null, machine: f.SN_x0023_ || null, priority: f.Priority || null, type: f.Issuearea || null,
      reporter: names(f.Author)[0] || null, created: f.Created, modified: f.Modified
    }
  })
  const mine = tickets.filter(t => t.assignees.some(isMe) || t.assigneeEmails.some(isMe))

  return {
    ok: true, total: tickets.length,
    items: mine.map(t => ({
      sourceId: t.id,
      title: `#${t.id}  ${t.title}`,
      status: t.status, done: DONE.has(t.status.toLowerCase()),
      dueDate: null, url: `${ORIGIN}/?ticket=${t.id}`,
      group: 'Issues', subgroup: t.hub,
      meta: { hub: t.hub, machine: t.machine, priority: t.priority, type: t.type, reporter: t.reporter, from: t.reporter, with: t.assignees.filter(n => !isMe(n)) }
    }))
  }
}
