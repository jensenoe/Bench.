/**
 * Daily copies of the shared JSON files. One per file per day, kept 30 days, written the
 * first time a file is saved on a given day. Cheap insurance against a colleague's Bench
 * writing over yours on the share.
 */
import fs from 'node:fs'
import path from 'node:path'

const KEEP_DAYS = 30
const done = new Set()   // `${file}:${date}` already copied this run

export function backupOnce(filePath) {
  try {
    if (!fs.existsSync(filePath)) return
    const date = new Date().toISOString().slice(0, 10)
    const key = `${filePath}:${date}`
    if (done.has(key)) return
    const dir = path.join(path.dirname(filePath), 'backups')
    fs.mkdirSync(dir, { recursive: true })
    const base = path.basename(filePath, '.json')
    const target = path.join(dir, `${base}.${date}.json`)
    if (!fs.existsSync(target)) fs.copyFileSync(filePath, target)
    done.add(key)
    // prune
    const cutoff = Date.now() - KEEP_DAYS * 86400000
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith(base + '.')) continue
      const m = /(\d{4}-\d{2}-\d{2})\.json$/.exec(f)
      if (m && new Date(m[1]).getTime() < cutoff) fs.rmSync(path.join(dir, f), { force: true })
    }
  } catch (err) { console.warn('[backup]', err.message) }
}
