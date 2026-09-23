/**
 * Fetch helpers for the background modules (server/core.js): the chase list, sheet drift and the change
 * feed. Lead times live in leadtimes.js, health and backups in extras.js; `j` and `H` come from http.js.
 */
import { j, H } from './http.js'
const q = (o) => { const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString(); return s ? `?${s}` : '' }

// chase list (71)
export const getChase = () => fetch('/api/reminders/chase').then(j)
// sheet drift (74)
export const getDrift = (ym, force = false) => fetch(`/api/timeclock/drift${q({ ym, force: force ? '1' : '' })}`).then(j)
// change feed (87)
export const getHistory = (limit = 50) => fetch(`/api/history${q({ limit })}`).then(j)
export const undoChange = (id) => fetch(`/api/history/${id}/undo`, { method: 'POST', headers: H, body: '{}' }).then(j)
