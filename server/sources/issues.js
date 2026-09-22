/**
 * Issue tickets (issues.tom.fit). The site is a front-end over one SharePoint list; we read
 * that list directly through Graph with your own Microsoft 365 sign-in, so there is no
 * hidden browser window and nothing to sign in to separately.
 *
 *   site  netorgft10707311.sharepoint.com,ae25541d-…,f2e21d90-…
 *   list  635ea462-3c0a-4036-82da-3d28e2e1de63
 *
 * "incharge" is a multi-person column; expanding fields with an explicit $select is what
 * makes Graph return the names and emails instead of only a lookup id.
 */
import { getTokenSilent, getAccount } from '../auth.js'
import { isMe } from '../settings.js'

export const ORIGIN = 'https://issues.tom.fit'
const SITE = process.env.ISSUES_SITE_ID || 'netorgft10707311.sharepoint.com,ae25541d-01d9-40fd-9235-46244cdae5cf,f2e21d90-c59a-4062-be3f-28a9cb960c1b'
const LIST = process.env.ISSUES_LIST_ID || '635ea462-3c0a-4036-82da-3d28e2e1de63'
const FIELDS = ['id', 'Title', 'status', 'Hub', 'Priority', 'Issuearea', 'SN_x0023_', 'incharge', 'Author', 'Created', 'Modified', 'Solvedon']
const DONE = new Set(['resolved', 'closed', 'done', 'erledigt', 'abgeschlossen'])

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
const names = (v) => people(v).map(p => p?.LookupValue || p?.Email || '').filter(Boolean)

export async function fetchIssues() {
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
