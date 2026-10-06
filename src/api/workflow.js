/** Paket and E2E on a plan (server/workflow.js, roadmap 170): the flow, its gates, scope, escalation, done. */
import { j, H } from './http.js'
const at = (id, what = '') => `/api/workflow/${encodeURIComponent(id)}${what ? `/${what}` : ''}`
const post = (id, what, body = {}) => fetch(at(id, what), { method: 'POST', headers: H, body: JSON.stringify(body) }).then(j)
export const getFlow = (id) => fetch(at(id)).then(j)
export const nextStep = (id, to) => post(id, 'next', { to })
export const stepBack = (id) => post(id, 'back')
export const tickFlow = (id, item, on, by) => post(id, 'tick', { item, on, by })
/** A task joins a Paket: agreed adds it and logs the decision, not agreed logs a scope question. */
export const scopeTask = (id, taskId, agreed, phase = null) => post(id, 'scope', { taskId, agreed, phase })
export const markEscalated = (id) => post(id, 'escalated')
export const reportDone = (id) => post(id, 'done')
