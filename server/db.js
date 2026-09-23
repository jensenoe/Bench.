/**
 * Where the board's documents live (roadmap 109). Two engines behind one small surface:
 *
 *   json     tasks.json, logbook.json and napkin.json in BENCH_DATA_DIR, exactly as before. The default,
 *            and the one for a shared folder: store.js keeps its mtime watch and reconcile on top of it.
 *   sqlite   one database, BENCH_DATA_DIR/bench.sqlite, a table per collection, each document a JSON blob
 *            with its id and updatedAt (better-sqlite3, see db-sqlite.js). Opt in with BENCH_STORAGE=sqlite.
 *            Meant for one machine first. When the native module cannot be loaded Bench falls back to the
 *            files and `describe()` says so.
 *
 * store.js and notes.js keep their caches, their offline patience and the reconcile; they only read and
 * write whole documents through `collection(name, dir)`. A collection looks like the file did:
 *   exists()     anything stored yet
 *   read()       the whole document ({ tasks, meta } or { items }); throws when it cannot be parsed
 *   write(doc)   atomic replace
 *   mtime()      when it last changed, ms since the epoch, 0 when nothing is stored
 *   path         where it is, for messages;  file  the JSON path for the daily backup, null on sqlite
 *   moveAside()  keep an unreadable store as evidence and start clean
 *
 *   node server/db.js migrate --to sqlite      copies the JSON files into the database
 *   node server/db.js migrate --to json        copies the database back into the files
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sqlite from './db-sqlite.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ENGINES = ['json', 'sqlite']
/** name -> { file, key, meta }: the file it was, the array inside it, whether it carries a meta object. */
export const COLLECTIONS = {
  tasks: { file: 'tasks.json', key: 'tasks', meta: true },
  logbook: { file: 'logbook.json', key: 'items', meta: false },
  napkin: { file: 'napkin.json', key: 'items', meta: false }
}
const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))

/** Read at call time, not at import: the tests point BENCH_DATA_DIR at scratch folders one after another. */
export const dataDir = () => process.env.BENCH_DATA_DIR || path.join(__dirname, '..', 'data')
/** What was asked for: BENCH_STORAGE, json when unset or unknown. */
export const wanted = () => { const w = String(process.env.BENCH_STORAGE || 'json').trim().toLowerCase(); return ENGINES.includes(w) ? w : 'json' }

// ── the json engine: the files as they were ───────────────────────────
export function jsonEngine(dir) {
  return {
    engine: 'json', path: dir, dir,
    collection(name) {
      const def = COLLECTIONS[name]
      if (!def) throw new Error(`unknown collection ${name}`)
      const p = path.join(dir, def.file)
      return {
        engine: 'json', name, path: p, file: p,
        exists: () => fs.existsSync(p),
        read: () => JSON.parse(fs.readFileSync(p, 'utf8')),
        write(doc) {
          fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(p + '.tmp', JSON.stringify(doc, null, 2), 'utf8')
          fs.renameSync(p + '.tmp', p)
        },
        mtime: () => { try { return fs.statSync(p).mtimeMs } catch { return 0 } },
        moveAside() { const bak = `${p}.corrupt-${Date.now()}`; fs.copyFileSync(p, bak); return bak }
      }
    }
  }
}

// ── choosing ──────────────────────────────────────────────────────────
const engines = new Map()   // `${engine}:${dir}` -> engine, with `wanted` and `error` on it
/** The engine for a folder: the one asked for, or json with the reason when sqlite cannot start. */
export function engineFor(dir = dataDir(), want = wanted()) {
  const k = `${want}:${dir}`
  if (engines.has(k)) return engines.get(k)
  let e
  if (want === 'sqlite') {
    try { e = { ...sqlite.open(dir, COLLECTIONS), wanted: 'sqlite', error: null } } catch (err) {
      console.warn(`[db] sqlite asked for but not available, using the JSON files: ${err.message}`)
      e = { ...jsonEngine(dir), wanted: 'sqlite', error: err.message }
    }
  } else e = { ...jsonEngine(dir), wanted: 'json', error: null }
  engines.set(k, e)
  return e
}
/** One collection through the engine in use. */
export const collection = (name, dir = dataDir()) => engineFor(dir).collection(name)
/**
 * The Storage line in Settings: what runs, what was asked for, where, and why they differ. The native module
 * is never loaded just to answer this (see db-sqlite.js `installed`): `sqliteAvailable` is true or false only
 * once sqlite was asked for, null otherwise; `sqliteInstalled` says whether the package is in node_modules.
 */
export function describe(dir = dataDir()) {
  const e = engineFor(dir)
  return {
    engine: e.engine, wanted: e.wanted, dir, path: e.engine === 'sqlite' ? e.path : null, error: e.error,
    sqliteAvailable: e.wanted === 'sqlite' ? e.engine === 'sqlite' : null,
    sqliteInstalled: sqlite.installed(),
    migrate: e.engine === 'sqlite' ? 'node server/db.js migrate --to json' : 'node server/db.js migrate --to sqlite'
  }
}

// ── migration ─────────────────────────────────────────────────────────
/**
 * Copy every collection from one engine to the other, replacing what the target holds. `to` is 'sqlite' or
 * 'json'. Returns { to, dir, copied: { tasks: n, logbook: n, napkin: n } }; a collection the source does not
 * have is skipped and reported as null. Not for a running Bench: stop it first, then start it with BENCH_STORAGE.
 */
export async function migrate(to, dir = dataDir()) {
  if (!ENGINES.includes(to)) throw new Error(`--to must be one of ${ENGINES.join(', ')}`)
  const source = to === 'sqlite' ? jsonEngine(dir) : sqlite.open(dir, COLLECTIONS)
  const target = to === 'sqlite' ? sqlite.open(dir, COLLECTIONS) : jsonEngine(dir)
  const copied = {}
  try {
    for (const name of Object.keys(COLLECTIONS)) {
      const from = source.collection(name), into = target.collection(name)
      if (!from.exists()) { copied[name] = null; continue }
      const doc = from.read()
      if (into.file && into.exists()) {   // the files get their daily copy before they are overwritten
        try { (await import('./backup.js')).backupOnce(into.file) } catch { /* the copy is a courtesy */ }
      }
      into.write(doc)
      copied[name] = (doc[COLLECTIONS[name].key] || []).length
    }
  } finally { source.close?.(); target.close?.() }
  return { to, dir, copied }
}

export function registerRoutes(app) {
  app.get('/api/storage', wrap((_req, res) => res.json(describe())))
}

// ── command line ──────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [cmd, ...rest] = process.argv.slice(2)
  const to = rest[rest.indexOf('--to') + 1]
  if (cmd !== 'migrate' || rest.indexOf('--to') < 0 || !to) {
    console.error('usage: node server/db.js migrate --to sqlite|json   (BENCH_DATA_DIR says where)')
    process.exit(2)
  }
  migrate(to).then(r => {
    console.log(`Copied into ${r.to} in ${r.dir}:`)
    for (const [k, n] of Object.entries(r.copied)) console.log(`  ${k}: ${n === null ? 'nothing to copy' : `${n} document${n === 1 ? '' : 's'}`}`)
    if (r.to === 'sqlite') console.log('Start Bench with BENCH_STORAGE=sqlite to use it.')
    else console.log('Start Bench without BENCH_STORAGE (or with BENCH_STORAGE=json) to use the files.')
  }).catch(err => { console.error(err.message); process.exit(1) })
}
