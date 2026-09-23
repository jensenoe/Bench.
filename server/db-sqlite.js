/**
 * The sqlite engine behind db.js (roadmap 109). One file, BENCH_DATA_DIR/bench.sqlite, a table per
 * collection (tasks, logbook, napkin): a row per document with its id, its position in the list, its
 * updatedAt and the document as JSON text. A `collections` table keeps each collection's meta (the
 * task store's sync record) and when it was last written, which is what store.js reads as the "mtime".
 *
 * better-sqlite3 is loaded on first use, never at import, so a Bench whose binary does not fit the
 * runtime still starts on the JSON files (db.js falls back and says so). Meant for one machine first;
 * two Benches on one shared folder keep using the JSON engine and its reconcile.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
export const FILE_NAME = 'bench.sqlite'

let Database = null, loadError = null
/** The native module, or the reason it is not there. Tried once. */
export function driver() {
  if (!Database && !loadError) {
    try { Database = require('better-sqlite3') } catch (err) { loadError = err }
  }
  return { Database, error: loadError }
}
export const available = () => Boolean(driver().Database)
/**
 * Is the package there at all, without loading it. Loading is the risky part: a binary built for another
 * Node-API version does not throw inside Electron, it takes the process down. So nothing loads it unless
 * BENCH_STORAGE asks for sqlite; Settings only gets this answer.
 */
export function installed() { try { require.resolve('better-sqlite3'); return true } catch { return false } }

/**
 * Open (or create) the database in `dir` for the given collection definitions
 * ({ name: { key, meta } }, see db.js). Throws when better-sqlite3 cannot be loaded.
 */
export function open(dir, collections) {
  const { Database: D, error } = driver()
  if (!D) throw Object.assign(new Error(`better-sqlite3 is not available here: ${error?.message || 'unknown reason'}`), { cause: error })
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, FILE_NAME)
  const names = Object.keys(collections)
  const connect = () => {
    const d = new D(file, { timeout: 3000 })
    d.exec('CREATE TABLE IF NOT EXISTS collections (name TEXT PRIMARY KEY, meta TEXT, writtenAt REAL NOT NULL)')
    for (const n of names) d.exec(`CREATE TABLE IF NOT EXISTS "${n}" (id TEXT PRIMARY KEY, pos INTEGER NOT NULL DEFAULT 0, updatedAt TEXT, json TEXT NOT NULL)`)
    return d
  }
  let db = connect()

  const engine = {
    engine: 'sqlite', path: file, dir,
    /** The database could not be read: keep it aside as evidence and start a fresh one. */
    moveAside() {
      try { db.close() } catch { /* already closed */ }
      const bak = `${file}.corrupt-${Date.now()}`
      try { fs.renameSync(file, bak) } catch { /* nothing to move */ }
      db = connect()
      return bak
    },
    close() { try { db.close() } catch { /* already closed */ } },
    collection(name) {
      const def = collections[name]
      if (!def) throw new Error(`unknown collection ${name}`)
      const table = `"${name}"`
      const upsert = (doc, pos) => db.prepare(`INSERT INTO ${table} (id, pos, updatedAt, json) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET pos = excluded.pos, updatedAt = excluded.updatedAt, json = excluded.json`)
        .run(String(doc.id), pos, doc.updatedAt || null, JSON.stringify(doc))
      /** Stamp the collection as written now; `meta` undefined keeps what is there. */
      const touch = (meta) => db.prepare(`INSERT INTO collections (name, meta, writtenAt) VALUES (?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET meta = COALESCE(excluded.meta, collections.meta), writtenAt = excluded.writtenAt`)
        .run(name, meta === undefined ? null : JSON.stringify(meta ?? null), Date.now())
      const loadAll = () => db.prepare(`SELECT json FROM ${table} ORDER BY pos, rowid`).all().map(r => JSON.parse(r.json))
      const col = {
        engine: 'sqlite', name, path: file, file: null,
        exists: () => Boolean(db.prepare('SELECT 1 FROM collections WHERE name = ?').get(name)),
        /** The whole collection in the shape the JSON file had: { tasks, meta } or { items }. */
        read() {
          const doc = { [def.key]: loadAll() }
          if (def.meta) {
            const row = db.prepare('SELECT meta FROM collections WHERE name = ?').get(name)
            doc.meta = row?.meta ? JSON.parse(row.meta) : null
          }
          return doc
        },
        /** Replace the collection with the document: every row saved, rows not in it removed, one transaction. */
        write(doc) {
          db.transaction(() => {
            const docs = Array.isArray(doc?.[def.key]) ? doc[def.key] : []
            const keep = new Set()
            docs.forEach((d, i) => { if (d && d.id !== undefined && d.id !== null) { keep.add(String(d.id)); upsert(d, i) } })
            for (const { id } of db.prepare(`SELECT id FROM ${table}`).all()) if (!keep.has(id)) db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
            touch(def.meta ? (doc?.meta ?? null) : undefined)
          })()
        },
        // the per-document surface, for callers that know which one changed
        loadAll,
        saveDoc(d) {
          if (!d || d.id === undefined || d.id === null) throw new Error('a document needs an id')
          db.transaction(() => {
            const cur = db.prepare(`SELECT pos FROM ${table} WHERE id = ?`).get(String(d.id))
            const pos = cur ? cur.pos : (db.prepare(`SELECT COALESCE(MAX(pos), -1) + 1 AS next FROM ${table}`).get().next)
            upsert(d, pos)
            touch()
          })()
          return d
        },
        deleteDoc(id) {
          const r = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(String(id))
          if (r.changes) touch()
          return r.changes > 0
        },
        /** Last write, ms since the epoch; 0 before the first. */
        mtime: () => db.prepare('SELECT writtenAt FROM collections WHERE name = ?').get(name)?.writtenAt || 0,
        stamp: () => { const r = db.prepare(`SELECT writtenAt, (SELECT count(*) FROM "${name}") AS n FROM collections WHERE name = ?`).get(name); return r ? `${r.writtenAt}:${r.n}` : '0:0' },
        moveAside: () => engine.moveAside()
      }
      return col
    }
  }
  return engine
}
