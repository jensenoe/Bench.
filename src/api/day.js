/** The day's bookends, the free-hours line and the weekly review (server/day.js). */
const j = async (res) => {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
  return res.json()
}
const H = { 'Content-Type': 'application/json' }
export const getBrief = () => fetch('/api/day/brief').then(j)
export const briefSeen = () => fetch('/api/day/brief/seen', { method: 'POST' }).then(j)
export const applyBrief = (toActive = []) => fetch('/api/day/brief/apply', { method: 'POST', headers: H, body: JSON.stringify({ toActive }) }).then(j)
export const getClose = () => fetch('/api/day/close').then(j)
export const closeDay = ({ toActive = [], keep = [], note = true } = {}) => fetch('/api/day/close', { method: 'POST', headers: H, body: JSON.stringify({ toActive, keep, note }) }).then(j)
export const getCapacity = () => fetch('/api/day/capacity').then(j)
export const getReview = (start) => fetch(`/api/review${start ? `?start=${encodeURIComponent(start)}` : ''}`).then(j)
