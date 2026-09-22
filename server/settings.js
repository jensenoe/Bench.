/**
 * Per-user settings. One JSON file in the user's profile (never the shared data folder):
 * who you are, where your hours go, how the board looks. The first-run screen fills the
 * first two; the Settings panel edits all of it.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(
  process.env.BENCH_USER_DIR || process.env.BENCH_SECRETS_DIR || process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data'),
  'settings.json'
)

export const DEFAULTS = {
  name: '',                 // as the tools spell it, e.g. "Noël Jensen"
  email: '',
  setupDone: false,
  theme: 'dark',            // dark | light
  sceneOverride: null,      // null follows the clock; dawn | day | dusk | night pins it
  collections: ['alps', 'tropics', 'urban', 'mono', 'pnw', 'desert', 'brutalist', 'italy', 'canada', 'autumn', 'gothic'],
  pictureMinutes: 20,
  // {year} and {name} are filled in; name is the full name with diacritics stripped (Noel Jensen)
  timesheetPath: 'Documents/TomFit_Zeiterfassung_{year}_{name}.xlsx',
  timesheetUrl: '',         // a OneDrive sharing link wins over the path when set
  lunchAt: '12:00',
  lunchEnds: '12:30',
  roundMinutes: 5,
  nudges: true              // water / coffee line under the completion toast
}

const ALLOWED = Object.keys(DEFAULTS)
let cache = null

export function get() {
  if (cache) return cache
  try { cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) } }
  catch { cache = { ...DEFAULTS } }
  // legacy .env still wins for people who set it before the settings panel existed
  if (process.env.TIMESHEET_PATH && !cache._pathSetByUser) cache.timesheetPath = process.env.TIMESHEET_PATH
  if (process.env.TIMESHEET_URL && !cache.timesheetUrl) cache.timesheetUrl = process.env.TIMESHEET_URL
  return cache
}

export function update(patch = {}) {
  const cur = get()
  for (const k of ALLOWED) {
    if (!(k in patch)) continue
    let v = patch[k]
    if (k === 'collections') v = Array.isArray(v) ? v.filter(x => typeof x === 'string') : cur.collections
    if (k === 'roundMinutes') v = Math.max(1, Math.min(30, Number(v) || 5))
    if (k === 'pictureMinutes') v = [10, 20, 30, 60].includes(Number(v)) ? Number(v) : 20
    if (k === 'theme') v = v === 'light' ? 'light' : 'dark'
    if (k === 'sceneOverride') v = ['dawn', 'day', 'dusk', 'night'].includes(v) ? v : null
    if ((k === 'lunchAt' || k === 'lunchEnds') && !/^\d{1,2}:\d{2}$/.test(String(v))) continue
    if (typeof v === 'string') v = v.trim()
    cur[k] = v
    if (k === 'timesheetPath') cur._pathSetByUser = true
  }
  // The first run ends when the UI says so (after the Microsoft step), not the moment a name lands.
  if (patch.setupDone === true && cur.name && cur.email) cur.setupDone = true
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(cur, null, 2))
  fs.renameSync(tmp, FILE)
  return cur
}

// ── identity helpers ──────────────────────────────────────────────────
export const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
export const firstName = () => strip(get().name).split(/\s+/)[0] || ''
export const displayFirstName = () => (get().name || '').split(/\s+/)[0] || ''

/**
 * Does a free-text assignee field refer to this user?
 * Matches the full name, the surname (>= 3 letters), the email, or the email's local part,
 * all diacritic- and case-insensitive. "Noel Jensen", "Noël", "noel@tom.fit", "n.jensen" all hit.
 */
export function isMe(text) {
  if (!text) return false
  const t = strip(text).toLowerCase()
  const { name, email } = get()
  const parts = strip(name).toLowerCase().split(/\s+/).filter(Boolean)
  if (!parts.length && !email) return false
  const full = parts.join(' ')
  const last = parts.length > 1 ? parts.at(-1) : null
  const first = parts[0]
  const local = (email || '').toLowerCase().split('@')[0]
  if (full && t.includes(full)) return true
  if (last && last.length >= 3 && t.includes(last)) return true
  if (email && t.includes(email.toLowerCase())) return true
  if (local && local.length >= 3 && t.includes(local)) return true
  // "Noël J." style abbreviations
  if (first && last && new RegExp(`\\b${first}\\s+${last[0]}\\b`).test(t)) return true
  return false
}

/** Workbook path with placeholders filled. */
export function timesheetPath(year = new Date().getFullYear()) {
  return get().timesheetPath.replace('{year}', String(year)).replace('{name}', strip(get().name) || 'Noel Jensen')
}
