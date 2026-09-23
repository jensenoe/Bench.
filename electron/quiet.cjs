/**
 * Quiet hours (roadmap 101). One pure question: given the clock and the settings, should a notification
 * be dropped? CommonJS so electron/main.cjs can require it and a Vitest test can import it.
 *
 *   quietFrom, quietTo   'HH:MM'; the range may cross midnight (19:00 to 07:00 is the default)
 *   quietWeekends        true drops everything on Saturday and Sunday
 *
 * A malformed or missing time means that side of the range is off. Equal times mean no range at all.
 */
const minutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim())
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

/** True when `now` (a Date) falls inside the quiet range or on a quiet weekend day. */
function isQuiet(now, settings = {}) {
  const d = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(d.getTime())) return false
  if (settings.quietWeekends === true && (d.getDay() === 0 || d.getDay() === 6)) return true
  const from = minutes(settings.quietFrom), to = minutes(settings.quietTo)
  if (from === null || to === null || from === to) return false
  const t = d.getHours() * 60 + d.getMinutes()
  // 22:00 to 06:00 wraps: quiet from 22:00 up to midnight and from midnight up to 06:00
  return from < to ? (t >= from && t < to) : (t >= from || t < to)
}

module.exports = { isQuiet, minutes }
