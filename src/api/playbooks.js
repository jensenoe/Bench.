/** Commissioning playbooks (server/playbooks.js, roadmap 114). */
import { j, H } from './http.js'

/** [{ id, name, machineType, tasks: [{ title, lane, effortHours?, checklist?, orderBy?: '+N', supplier? }] }] */
export const getPlaybooks = () => fetch('/api/playbooks').then(j)
/** Create or update; the id decides which. */
export const savePlaybook = (body) => fetch('/api/playbooks', { method: 'POST', headers: H, body: JSON.stringify(body) }).then(j)
export const removePlaybook = (id) => fetch(`/api/playbooks/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(j)
/** -> { created: [ids], project, playbook } */
export const applyPlaybook = (id, project) => fetch(`/api/playbooks/${encodeURIComponent(id)}/apply`, { method: 'POST', headers: H, body: JSON.stringify({ project }) }).then(j)
/** A template from a machine's tasks -> the saved template. */
export const playbookFromMachine = (key, name) => fetch('/api/playbooks/from-machine', { method: 'POST', headers: H, body: JSON.stringify({ key, name }) }).then(j)
