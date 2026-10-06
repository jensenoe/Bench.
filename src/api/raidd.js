/** The RAIDD log of a project (server/raidd.js, roadmap 168). A project is "I-1050" or "plan:<id>". */
import { j, H } from './http.js'
export const getRaidd = (project) => fetch(`/api/raidd?project=${encodeURIComponent(project)}`).then(j)
export const createRaidd = (body) => fetch('/api/raidd', { method: 'POST', headers: H, body: JSON.stringify(body) }).then(j)
export const patchRaidd = (id, body) => fetch(`/api/raidd/${encodeURIComponent(id)}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) }).then(j)
export const removeRaidd = (id) => fetch(`/api/raidd/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(j)
