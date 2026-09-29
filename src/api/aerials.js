/** The moving hero's clips: what is cached, what to fetch next, and emptying the cache (server/aerials.js). */
import { j, H } from './http.js'

export const getAerials = () => fetch('/api/aerials').then(j)
export const prefetchAerials = (ids) => fetch('/api/aerials/prefetch', { method: 'POST', headers: H, body: JSON.stringify({ ids }) }).then(j)
export const clearAerials = () => fetch('/api/aerials/clear', { method: 'POST' }).then(j)
