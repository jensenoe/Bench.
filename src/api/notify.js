/** Notification history (roadmap 107, server/notify.js): what Bench told you, and marking it read. */
const j = async (res) => {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
  return res.json()
}
const H = { 'Content-Type': 'application/json' }
/** { items: [{ id, at, title, body, route, read }], unread }, newest first. */
export const getNotifications = (limit = 20) => fetch(`/api/notifications?limit=${encodeURIComponent(limit)}`).then(j)
/** Some ids, or 'all'. Answers { unread }. */
export const markNotificationsRead = (ids) => fetch('/api/notifications/read', { method: 'POST', headers: H, body: JSON.stringify(ids === 'all' ? { all: true } : { ids }) }).then(j)
