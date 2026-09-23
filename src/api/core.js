/**
 * Fetch helpers for the background modules (server/core.js): lead times, chase list, sheet drift,
 * health and diagnostics, the change feed, backups. Same tiny `j` pattern as src/api.js.
 */
const j = async (res) => {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
  return res.json()
}
const H = { 'Content-Type': 'application/json' }
const q = (o) => { const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString(); return s ? `?${s}` : '' }

// lead times (70)
export const getLeadTimes = () => fetch('/api/leadtimes').then(j)
export const suggestLeadTime = (supplier, needBy) => fetch(`/api/leadtimes/suggest${q({ supplier, needBy })}`).then(j)
// chase list (71)
export const getChase = () => fetch('/api/reminders/chase').then(j)
// sheet drift (74)
export const getDrift = (ym, force = false) => fetch(`/api/timeclock/drift${q({ ym, force: force ? '1' : '' })}`).then(j)
// health (78)
export const getHealth = (force = false) => fetch(`/api/health${force ? '?force=1' : ''}`).then(j)
export const getDiagnostics = () => fetch('/api/diagnostics').then(async r => { if (!r.ok) throw new Error(r.statusText); return r.text() })
// change feed (87)
export const getHistory = (limit = 50) => fetch(`/api/history${q({ limit })}`).then(j)
export const undoChange = (id) => fetch(`/api/history/${id}/undo`, { method: 'POST', headers: H, body: '{}' }).then(j)
// backups (96)
export const getBackups = () => fetch('/api/backups').then(j)
export const backupNow = () => fetch('/api/backups/now', { method: 'POST', headers: H, body: '{}' }).then(j)
export const restoreBackup = (file) => fetch('/api/backups/restore', { method: 'POST', headers: H, body: JSON.stringify({ file }) }).then(j)
