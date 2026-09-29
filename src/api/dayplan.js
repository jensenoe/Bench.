/** Plan my day (server/dayplan.js, roadmap 161): the proposal, applying it, and the undo. */
import { j, H } from './http.js'
/** { date, cap, keep, add, out, hours: { free, planned, workday, meetings, unsized }, why, items } */
export const getPlan = () => fetch('/api/dayplan').then(j)
/** { added, moved, before }: `before` is what undoPlan needs. */
export const applyPlan = ({ add = [], out = [] } = {}) => fetch('/api/dayplan/apply', { method: 'POST', headers: H, body: JSON.stringify({ add, out }) }).then(j)
export const undoPlan = (before = []) => fetch('/api/dayplan/undo', { method: 'POST', headers: H, body: JSON.stringify({ before }) }).then(j)
