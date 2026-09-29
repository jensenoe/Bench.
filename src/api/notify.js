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
/** Put a row away and have it come back: 'hour' or 'tomorrow' (08:30). Answers { until, unread }. */
export const snoozeNotification = (id, preset) => fetch(`/api/notifications/${encodeURIComponent(id)}/snooze`, { method: 'POST', headers: H, body: JSON.stringify({ preset }) }).then(j)
/** { categories: [{ key, label, hint, default, cap, mode }] } for Settings > Notifications. */
export const getNotifyCategories = () => fetch('/api/notifications/categories').then(j)
/** One test notification, through the quiet hours. */
export const sendTestNotification = () => fetch('/api/notifications/test', { method: 'POST' }).then(j)
/** The focus timer runs until this ISO time; null when it paused or stopped. Toasts wait meanwhile. */
export const setFocusUntil = (until) => fetch('/api/notifications/focus', { method: 'POST', headers: H, body: JSON.stringify({ until }) }).then(j)
/** The focus timer ran out: through the server, so it lands in the Bell and follows the policy. */
export const sendFocusDone = (title) => fetch('/api/notifications/send', { method: 'POST', headers: H, body: JSON.stringify({ category: 'focus', title: 'Focus done.', body: title, route: '#/board' }) }).then(j)
