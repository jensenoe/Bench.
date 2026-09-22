import { getTokenSilent, scopes } from './auth.js'
import { mergePlannerTasks, setMeta } from './store.js'

const GRAPH = 'https://graph.microsoft.com/v1.0'

async function graphGet(token, url) {
  const res = await fetch(url.startsWith('http') ? url : GRAPH + url, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Graph ${res.status} ${res.statusText} on ${url} ${body.slice(0, 300)}`)
  }
  return res.json()
}

/** Follows @odata.nextLink so a long task list is not silently truncated. */
async function graphGetAll(token, url) {
  const out = []
  let next = url
  while (next) {
    const page = await graphGet(token, next)
    out.push(...(page.value || []))
    next = page['@odata.nextLink'] || null
  }
  return out
}

const planCache = new Map()
const bucketCache = new Map()

async function planTitle(token, planId) {
  if (!planId) return null
  if (planCache.has(planId)) return planCache.get(planId)
  try {
    const p = await graphGet(token, `/planner/plans/${planId}`)
    planCache.set(planId, p.title || null)
    return p.title || null
  } catch { planCache.set(planId, null); return null }
}

async function bucketName(token, bucketId) {
  if (!bucketId) return null
  if (bucketCache.has(bucketId)) return bucketCache.get(bucketId)
  try {
    const b = await graphGet(token, `/planner/buckets/${bucketId}`)
    bucketCache.set(bucketId, b.name || null)
    return b.name || null
  } catch { bucketCache.set(bucketId, null); return null }
}

export async function syncFromPlanner() {
  const token = await getTokenSilent()
  if (!token) return { ok: false, reason: 'not-signed-in' }

  try {
    const raw = await graphGetAll(token, '/me/planner/tasks')
    const mapped = []
    for (const t of raw) {
      mapped.push({
        plannerId: t.id,
        title: t.title || '(untitled)',
        dueDate: t.dueDateTime || null,
        done: (t.percentComplete ?? 0) >= 100,
        planTitle: await planTitle(token, t.planId),
        bucketName: await bucketName(token, t.bucketId)
      })
    }
    const result = mergePlannerTasks(mapped)
    setMeta({ lastSync: new Date().toISOString(), lastSyncError: null })
    return { ok: true, fetched: mapped.length, ...result }
  } catch (err) {
    setMeta({ lastSyncError: err.message })
    return { ok: false, reason: err.message }
  }
}

/** Push completion back, so Planner stays the single source of truth. */
export async function completeInPlanner(plannerId) {
  if (!scopes().some(s => s.includes('ReadWrite'))) {
    return { ok: false, reason: 'read-only scope' }
  }
  const token = await getTokenSilent()
  if (!token) return { ok: false, reason: 'not-signed-in' }
  try {
    const current = await graphGet(token, `/planner/tasks/${plannerId}`)
    const etag = current['@odata.etag']
    const res = await fetch(`${GRAPH}/planner/tasks/${plannerId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'If-Match': etag,
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ percentComplete: 100 })
    })
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.slice(0, 300))
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}
