/** Fetch helpers for the later additions: the phone inbox, the weather, health, backups and the update download. */
const j = async (res) => {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
  return res.json()
}
const H = { 'Content-Type': 'application/json' }

export const getInbox = () => fetch('/api/inbox').then(j)
export const attachInbox = (name, taskId, label) => fetch('/api/inbox/attach', { method: 'POST', headers: H, body: JSON.stringify({ name, taskId, label }) }).then(j)
export const dismissInbox = (name) => fetch('/api/inbox/dismiss', { method: 'POST', headers: H, body: JSON.stringify({ name }) }).then(j)

export const getWeather = () => fetch('/api/weather').then(j)

export const getHealth = (force = false) => fetch(`/api/health${force ? '?force=1' : ''}`).then(j)
export const getDiagnostics = () => fetch('/api/diagnostics').then(r => r.ok ? r.text() : Promise.reject(new Error(r.statusText)))

export const getBackups = () => fetch('/api/backups').then(j)
export const backupNow = () => fetch('/api/backups/now', { method: 'POST' }).then(j)
export const restoreBackup = (file) => fetch('/api/backups/restore', { method: 'POST', headers: H, body: JSON.stringify({ file }) }).then(j)

export const downloadUpdate = () => fetch('/api/updates/download', { method: 'POST' }).then(j)

/** A toast through App, and a state refresh, without a prop drilled through every page. */
export const toast = (text, by = null) => window.dispatchEvent(new CustomEvent('bench:toast', { detail: { text, by, plain: true } }))
export const refresh = () => window.dispatchEvent(new Event('bench:refresh'))
