/** Projects (server/projects.js, roadmap 121): plans with phases, a deadline, slack and fit. */
import { j, H } from './http.js'
export const getProjects = () => fetch('/api/projects').then(j)
export const getProject = (id) => fetch(`/api/projects/${encodeURIComponent(id)}`).then(j)
export const createProject = (body) => fetch('/api/projects', { method: 'POST', headers: H, body: JSON.stringify(body) }).then(j)
export const patchProject = (id, body) => fetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) }).then(j)
export const removeProject = (id) => fetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(j)
/** Re-plan from the deadline; apply also writes need-by and order-by onto the parts. */
export const scheduleProject = (id, apply = false) => fetch(`/api/projects/${encodeURIComponent(id)}/schedule`, { method: 'POST', headers: H, body: JSON.stringify({ apply }) }).then(j)
export const assignPhase = (id, taskId, phase) => fetch(`/api/projects/${encodeURIComponent(id)}/assign`, { method: 'POST', headers: H, body: JSON.stringify({ taskId, phase }) }).then(j)
