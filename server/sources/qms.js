import { bridge } from '../bridge.js'

export const ORIGIN = 'https://tf-hw-qms.vercel.app'
import { isMe } from '../settings.js'
const DONE = new Set(['erledigt'])

/**
 * QMS: Next.js with a server session. One call returns every ticket.
 * `assigned_to` is a display name; match on yours.
 */
export async function fetchQms() {
  if (!bridge.desktop) return { ok: false, reason: 'desktop-only' }
  const res = await bridge.fetchWithSession(`${ORIGIN}/api/tickets`, { headers: { accept: 'application/json' } })
  if (res.status === 401 || res.status === 403 || res.redirected && /login\.microsoftonline/.test(res.url)) return { ok: false, reason: 'needs-signin' }
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('json')) return { ok: false, reason: 'needs-signin' }
  const { tickets = [] } = await res.json()
  const mine = tickets.filter(t => t.assigned_to && isMe(t.assigned_to))
  return {
    ok: true, total: tickets.length,
    items: mine.map(t => ({
      sourceId: t.id,
      title: `${t.ticket_id}  ${(t.problem || '').replace(/\s+/g, ' ').trim().slice(0, 110)}`,
      status: t.status, done: DONE.has(String(t.status).toLowerCase()),
      dueDate: t.due_date || null,
      url: `${ORIGIN}/tickets/${t.id}`,
      group: 'QMS', subgroup: t.assembly_group || null,
      meta: { ticket: t.ticket_id, from: t.created_by || t.reported_by || t.reporter || t.creator || null, cause: t.cause, origin: t.origin, article: t.article_number, tags: (t.tags || []).map(x => x.name || x).slice(0, 6) }
    }))
  }
}
