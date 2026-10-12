import { j } from './http.js'
/**
 * Source health (roadmap 174, server/source-health.js): { state, sources: [{ key, label, kind, state, reason, since,
 * lastSync, action }], at }. state is ok, off, suspect, stale, error or signin; action is signin, connect, sync or null.
 */
export const getSourceHealth = () => fetch('/api/sources/health').then(j)
