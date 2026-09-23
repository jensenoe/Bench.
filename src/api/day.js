/** The day's bookends, the free-hours line and the weekly review (server/day.js). */
import { j, H } from './http.js'
export const getBrief = () => fetch('/api/day/brief').then(j)
export const briefSeen = () => fetch('/api/day/brief/seen', { method: 'POST' }).then(j)
export const applyBrief = (toActive = []) => fetch('/api/day/brief/apply', { method: 'POST', headers: H, body: JSON.stringify({ toActive }) }).then(j)
export const getClose = () => fetch('/api/day/close').then(j)
export const closeDay = ({ toActive = [], keep = [], note = true } = {}) => fetch('/api/day/close', { method: 'POST', headers: H, body: JSON.stringify({ toActive, keep, note }) }).then(j)
export const getCapacity = () => fetch('/api/day/capacity').then(j)
export const getReview = (start) => fetch(`/api/review${start ? `?start=${encodeURIComponent(start)}` : ''}`).then(j)
/** Cost per machine (server/cost.js, roadmap 115): { months, byMachine, byMonth, totalHours, totalCost, hourlyRate }. */
export const getCost = (months = 3) => fetch(`/api/cost?months=${encodeURIComponent(months)}`).then(j)
/** The CSV for the controller, as a link target. */
export const costCsvUrl = (months = 3) => `/api/cost.csv?months=${encodeURIComponent(months)}`
