/** RACI per project (server/raci.js, roadmap 169). The key is an I-code ("I-1050") or "plan:<id>". */
import { j, H } from './http.js'
const q = key => `/api/raci?project=${encodeURIComponent(key)}`
/** { matrix, suggestions, problems } */
export const getRaci = (key) => fetch(q(key)).then(j)
/** Saves the whole matrix; answers like getRaci with the cleaned matrix. */
export const saveRaci = (key, matrix) => fetch(q(key), { method: 'PUT', headers: H, body: JSON.stringify(matrix) }).then(j)
/** Back to the starting rows. */
export const resetRaci = (key) => fetch(q(key), { method: 'DELETE' }).then(j)
