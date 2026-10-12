/**
 * Rüsten per machine number (roadmap 171): every cable, connection, screw, part, parts list, schematic and
 * document a machine needs, kitted, checked and booked out of stock, per machine of a plan; then the
 * presentation (one machine from Bundle 1 to 5, one from Bundle 6) and the handover to Service.
 *
 * One document per project key ("plan:<id>", an I-code works too) in the shared data folder (`kitting` in
 * db.js: kitting.json, or a table on sqlite), so a colleague on the same folder sees the same kit. The rules
 * (cleaning, progress, merging, the BOM mapping) are pure and live in kitting-rules.js, which the tab imports
 * too; they are re-exported here. Tasks are never touched.
 *
 *   progress(machine)  planProgress(doc)  kitCompleteDoc(doc)  bundleCheck(doc)  itemsFromBom(nodes, rootId)
 *   kitComplete(planOrKey)   the gate for "Bauen": loads the plan's kit and answers true, false or null
 *   kittingReportHtml(doc, { esc, fmt, today, title, author, print })   the A4 handover for Service
 *
 *   GET  /api/kitting?project=KEY                      { doc, progress, complete, bundles, plan }
 *   PUT  /api/kitting?project=KEY                      saves the whole document, cleaned and clamped; answers as GET
 *   POST /api/kitting/apply-template?project=KEY       the template onto every machine, only what is missing
 *   GET  /api/kitting/bom[?machine=BOM_ID]             the BOM's machines, or one machine's assemblies (desktop only)
 *   POST /api/kitting/from-bom?project=KEY&machine=ID  { bomMachine, rootId }: the parts under a BOM node as items
 *   GET  /api/report/handover?project=KEY   GET /api/report/handover/:project   the handover report (?print=1)
 *
 * Workshop mode (roadmap 176): the phone (server/phone.js proxies to these) and the desktop's Workshop view tick
 * one item at a time, so a tick never travels inside a whole document and never overwrites another item.
 *
 *   GET    /api/kitting/jobs                              the open jobs: kits with machines not all handed over
 *   PATCH  /api/kitting/tick?project=KEY                  { machine, item, kitted?, checked?, stockUpdated? }
 *   POST   /api/kitting/photo?project=KEY&machine=ID      raw image bytes (&item=ID&caption=...); 12 MB, 40 per machine
 *   POST   /api/kitting/photo?...&photo=ID&rendition=small    the reduced copy of that photo, 1 MB
 *   GET    /api/kitting/photo?project=KEY&machine=ID&file=NAME   the picture, only when the kit names it
 *   PATCH  /api/kitting/photo?project=KEY&machine=ID&photo=ID    { caption }
 *   DELETE /api/kitting/photo?project=KEY&machine=ID&photo=ID    the reference and its files
 *   PUT    /api/kitting?project=KEY&keep=ticks           as PUT, but the stored ticks of known items stay
 *
 * Photos live in the shared folder beside the kit, never inside it: kitting-photos/<plan-id>/<machine id>/, under
 * names the server makes. A whole-document save (PUT) never adds or drops a photo; only the photo routes do.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import express from 'express'
import * as db from './db.js'
import * as settings from './settings.js'
import * as projects from './projects.js'
import { backupOnce } from './backup.js'
import { codeOf } from './codes.js'
import { bridge } from './bridge.js'
import { ORIGIN as BOM_ORIGIN } from './sources/bom.js'
import {
  KINDS, KIND_LABEL, KIND_ONE, STOCK_KINDS, MAX, needsStock, normNumber, normBundle, isoDate, cleanItem, cleanItems, cleanMachine, cleanDoc,
  progress, itemDone, missing, planProgress, kitCompleteDoc, bundleCheck, mergeItems, applyTemplate, parsePaste, kindFor, itemsFromBom,
  PHOTO_FILE, cleanPhoto, cleanPhotos, findItems, nextOpen, inKindOrder
} from './kitting-rules.js'

export {
  KINDS, KIND_LABEL, KIND_ONE, STOCK_KINDS, MAX, needsStock, normNumber, normBundle, isoDate, cleanItem, cleanItems, cleanMachine, cleanDoc,
  progress, itemDone, missing, planProgress, kitCompleteDoc, bundleCheck, mergeItems, applyTemplate, parsePaste, kindFor, itemsFromBom,
  PHOTO_FILE, cleanPhoto, cleanPhotos, findItems, nextOpen, inKindOrder
}

const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(err => res.status(err.status || 500).json({ error: err.message }))
const fail = (status, message) => Object.assign(new Error(message), { status })
const now = () => new Date().toISOString()
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// ── keys ──────────────────────────────────────────────────────────────
/** "plan:<id>" or an I-code, normalised; null when the text is neither. */
export function projectKey(v) {
  const s = String(v ?? '').trim()
  const plan = /^plan:([\w-]{1,80})$/.exec(s)
  if (plan) return `plan:${plan[1]}`
  return /^I-\d{3,5}$/i.test(s) ? codeOf(s) : null
}
const keyOrFail = v => {
  const k = projectKey(v)
  if (!k) throw fail(400, 'That is not a project key. Use plan: and the plan id, or an I-code such as I-1050.')
  return k
}
/** The plan behind a key, or null (an I-code, or a plan that is gone). */
const planOf = k => { if (!k.startsWith('plan:')) return null; try { return projects.list().find(p => p.id === k.slice(5)) || null } catch { return null } }

// ── storage ───────────────────────────────────────────────────────────
const col = () => db.collection('kitting')   // at call time: the tests move the data folder
function readAll() {
  const c = col()
  try { const d = c.exists() ? c.read() : null; return d && Array.isArray(d.items) ? d : { items: [] } } catch { return { items: [] } }
}
function writeAll(all) {
  const c = col()
  if (c.file && c.exists()) { try { backupOnce(c.file) } catch { /* the daily copy is a courtesy */ } }
  c.write(all)
}
const stored = k => { const d = readAll().items.find(x => x.id === k); if (!d) return null; const { id: _id, ...doc } = d; return doc }
const me = () => { try { return String(settings.get().name || '').trim().slice(0, 80) || null } catch { return null } }

/** The stored kit for a key, or an empty one. */
export function docFor(key) {
  const k = keyOrFail(key)
  return stored(k) ? cleanDoc(stored(k), k) : cleanDoc({}, k)
}
/**
 * The gate for "Bauen" (server/workflow.js): is the plan's kit complete? Takes the stored plan object (its id
 * makes the key "plan:<id>"), a key string, or a kit document. Synchronous. True when every machine is kitted,
 * checked and booked, false when one is not, null when no kit is stored, it has no machines, or the input
 * names no project. Never throws.
 */
export function kitComplete(planOrKey) {
  try {
    if (planOrKey && typeof planOrKey === 'object' && Array.isArray(planOrKey.machines)) return kitCompleteDoc(planOrKey)
    const key = typeof planOrKey === 'string' ? projectKey(planOrKey)
      : planOrKey && typeof planOrKey === 'object' && planOrKey.id !== undefined && planOrKey.id !== null ? projectKey(`plan:${planOrKey.id}`) : null
    if (!key) return null
    const doc = stored(key)
    return doc ? kitCompleteDoc(cleanDoc(doc, key)) : null
  } catch { return null }
}
/** What GET answers: the document, the counts, the gate and the presentation check, and the plan's name. */
export function viewFor(key) {
  const k = keyOrFail(key)
  const plan = planOf(k)
  const doc = docFor(k)
  if (k.startsWith('plan:') && !plan && !doc.updatedAt) throw fail(404, 'That plan is gone, and no kit was kept for it.')
  return { doc, progress: planProgress(doc), complete: kitCompleteDoc(doc), bundles: bundleCheck(doc), plan: { key: k, name: plan?.name || k.replace(/^plan:/, '') } }
}
/** Writes a cleaned document for the key as it is. Every save path ends here. */
function writeDoc(k, input) {
  const doc = { ...cleanDoc(input, k), updatedAt: now(), by: me() }
  const all = readAll()
  const i = all.items.findIndex(x => x.id === k)
  if (i < 0) all.items.push({ id: k, ...doc }); else all.items[i] = { id: k, ...doc }
  writeAll(all)
  return doc
}
const TICKS = ['kitted', 'checked', 'stockUpdated']
/**
 * Saves the whole document for the key, cleaned and clamped. Photos are the photo routes' business: each machine
 * keeps the photos stored for it, whatever the body says. With `keepTicks` (the desktop tab, which ticks through
 * tick()), every item that is stored already keeps its stored ticks, so a document loaded a minute ago cannot
 * untick what the phone ticked since.
 */
export function save(key, input = {}, { keepTicks = false } = {}) {
  const k = keyOrFail(key)
  const body = input && typeof input === 'object' && input.doc && typeof input.doc === 'object' ? input.doc : input
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'Send the kit as an object with template and machines.')
  if (k.startsWith('plan:') && !planOf(k) && !stored(k)) throw fail(404, 'That plan is gone.')
  const before = stored(k) ? cleanDoc(stored(k), k) : null
  const clean = cleanDoc(body, k)
  const machines = clean.machines.map(m => {
    const old = before?.machines.find(x => x.id === m.id)
    const items = keepTicks && old ? m.items.map(i => { const o = old.items.find(x => x.id === i.id); return o ? { ...i, ...Object.fromEntries(TICKS.map(f => [f, o[f]])) } : i }) : m.items
    return { ...m, items, photos: old ? old.photos : [] }
  })
  writeDoc(k, { ...clean, machines })
  return viewFor(k)
}

// ── workshop mode: one item, one photo at a time ──────────────────────
const soundId = v => typeof v === 'string' && /^[\w-]{1,64}$/.test(v)
/** The stored kit and one machine of it, read fresh; 404 when either is gone. */
function machineOf(k, machineId) {
  if (!soundId(machineId)) throw fail(400, 'Which machine?')
  if (k.startsWith('plan:') && !planOf(k) && !stored(k)) throw fail(404, 'That plan is gone.')
  const doc = docFor(k)
  const m = doc.machines.find(x => x.id === machineId)
  if (!m) throw fail(404, 'That machine is not on this kit any more.')
  return { doc, m }
}
/**
 * Ticks or unticks one item: reads the stored kit, changes only the named flags of that one item, and writes it
 * through the same cleaning as every save. The last tick on an item wins; the other items stay as stored.
 * Answers { item, machine: progress, complete, updatedAt }.
 */
export function tick(key, { machine, item, ...flags } = {}) {
  const k = keyOrFail(key)
  if (!soundId(item)) throw fail(400, 'Which item?')
  const change = Object.fromEntries(TICKS.filter(f => f in flags).map(f => [f, flags[f]]))
  if (!Object.keys(change).length || Object.values(change).some(v => typeof v !== 'boolean')) throw fail(400, 'Say kitted, checked or stockUpdated, as true or false.')
  const { doc, m } = machineOf(k, machine)
  const it = m.items.find(x => x.id === item)
  if (!it) throw fail(404, 'That item is not on the machine any more.')
  if ('stockUpdated' in change && !needsStock(it)) throw fail(400, 'That item does not come out of the store.')
  const next = { ...it, ...change }
  const saved = writeDoc(k, { ...doc, machines: doc.machines.map(x => x.id === m.id ? { ...x, items: x.items.map(i => i.id === it.id ? next : i) } : x) })
  const sm = saved.machines.find(x => x.id === m.id)
  return { item: sm.items.find(i => i.id === it.id), machine: { id: sm.id, number: sm.number, ...progress(sm) }, complete: kitCompleteDoc(saved), updatedAt: saved.updatedAt }
}

/** The open jobs for the bench: every kit with machines on a plan that is still there, not all handed over. */
export function jobs() {
  let plans = []
  try { plans = projects.list() } catch { /* no plans file yet */ }
  return readAll().items.map(x => {
    const k = projectKey(x?.id)
    if (!k) return null
    const plan = k.startsWith('plan:') ? plans.find(p => p.id === k.slice(5)) : null
    if (k.startsWith('plan:') && (!plan || plan.archived)) return null
    const doc = cleanDoc(x, k)
    if (!doc.machines.length || doc.machines.every(m => m.handedOverOn)) return null
    const { overall } = planProgress(doc)
    return { key: k, name: plan?.name || k, machines: overall.machines, complete: overall.complete, open: overall.open, total: overall.total,
      kitted: overall.kitted, checked: overall.checked, stock: overall.stock, stockNeeded: overall.stockNeeded, updatedAt: doc.updatedAt }
  }).filter(Boolean).sort((a, b) => (a.complete === a.machines) - (b.complete === b.machines) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

// Photos: kitting-photos/<key as a folder>/<machine id>/<file> in the shared data folder.
export const PHOTO_MAX_BYTES = 12 * 1024 * 1024
export const SMALL_MAX_BYTES = 1024 * 1024
export const photoRoot = () => path.join(db.dataDir(), 'kitting-photos')
const folderOf = k => k.replace(/[^\w-]/g, '-')
/** The folder of one machine's photos. Both parts are checked, so nothing can climb out of photoRoot. */
export function photoDir(key, machineId) {
  const k = keyOrFail(key)
  if (!soundId(machineId)) throw fail(400, 'Which machine?')
  const root = photoRoot(), dir = path.join(root, folderOf(k), machineId)
  if (!dir.startsWith(root + path.sep)) throw fail(400, 'Which machine?')
  return dir
}
const TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic' }
/** The type of an image from its first bytes, never from what the sender says: '.jpg', '.png', '.webp', '.heic' or null. */
export function sniffImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return '.jpg'
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return '.png'
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return '.webp'
  if (buf.toString('latin1', 4, 8) === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(buf.toString('latin1', 8, 12))) return '.heic'
  return null
}
const stamp = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}` }
const writePhotos = (k, doc, m, photos) => writeDoc(k, { ...doc, machines: doc.machines.map(x => x.id === m.id ? { ...x, photos } : x) })
const checkImage = (buf, max) => {
  if (!Buffer.isBuffer(buf) || !buf.length) throw fail(400, 'No picture arrived.')
  if (buf.length > max) throw fail(413, `That picture is over ${Math.round(max / 1024 / 1024)} MB.`)
  const ext = sniffImage(buf)
  if (!ext) throw fail(415, 'That is not a JPEG, PNG, WebP or HEIC picture.')
  return ext
}
/**
 * A photo of one machine (and optionally one of its items): the bytes go to a file named by the server, the kit
 * gets { id, file, at, caption?, itemId? } on that machine. Answers { photo, photos }.
 */
export function addPhoto(key, machineId, buf, { caption = '', itemId = '' } = {}) {
  const k = keyOrFail(key)
  const { doc, m } = machineOf(k, machineId)
  if (m.photos.length >= MAX.photos) throw fail(409, `${MAX.photos} photos is the most one machine holds. Remove one on the desktop first.`)
  const ext = checkImage(buf, PHOTO_MAX_BYTES)
  if (itemId && !m.items.some(i => i.id === itemId)) throw fail(404, 'That item is not on the machine any more.')
  const dir = photoDir(k, m.id)
  fs.mkdirSync(dir, { recursive: true })
  const file = `${m.number.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'machine'}-${stamp()}-${crypto.randomBytes(4).toString('hex')}${ext}`
  fs.writeFileSync(path.join(dir, file), buf, { flag: 'wx' })
  const photo = cleanPhoto({ id: crypto.randomUUID(), file, at: now(), caption, itemId: itemId || undefined })
  const saved = writePhotos(k, doc, m, [...m.photos, photo])
  return { photo, photos: saved.machines.find(x => x.id === m.id).photos }
}
/** The reduced copy of a photo (the phone and the desktop make it before sending), for the handover. */
export function addSmall(key, machineId, photoId, buf) {
  const k = keyOrFail(key)
  const { doc, m } = machineOf(k, machineId)
  const p = m.photos.find(x => x.id === photoId)
  if (!p) throw fail(404, 'That photo is not on the machine any more.')
  const ext = checkImage(buf, SMALL_MAX_BYTES)
  const dir = photoDir(k, m.id)
  const small = `${p.file.replace(/\.\w+$/, '')}-small${ext}`
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, small), buf)
  const saved = writePhotos(k, doc, m, m.photos.map(x => x.id === p.id ? { ...x, small } : x))
  return { photo: saved.machines.find(x => x.id === m.id).photos.find(x => x.id === p.id) }
}
/** A caption changed, or the photo gone (its files too). */
export function editPhoto(key, machineId, photoId, { caption, remove = false } = {}) {
  const k = keyOrFail(key)
  const { doc, m } = machineOf(k, machineId)
  const p = m.photos.find(x => x.id === photoId)
  if (!p) throw fail(404, 'That photo is not on the machine any more.')
  if (remove) {
    for (const f of [p.file, p.small].filter(Boolean)) { try { fs.unlinkSync(path.join(photoDir(k, m.id), f)) } catch { /* already gone */ } }
    writePhotos(k, doc, m, m.photos.filter(x => x.id !== p.id))
    return { removed: p.id }
  }
  const saved = writePhotos(k, doc, m, m.photos.map(x => x.id === p.id ? { ...x, caption: typeof caption === 'string' ? caption : '' } : x))
  return { photo: saved.machines.find(x => x.id === m.id).photos.find(x => x.id === p.id) }
}
/** Where a named photo file lives, only when the kit names it on that machine; 404 for anything else. */
export function photoFile(key, machineId, file) {
  const k = keyOrFail(key)
  if (typeof file !== 'string' || !PHOTO_FILE.test(file)) throw fail(400, 'Which picture?')
  const { m } = machineOf(k, machineId)
  if (!m.photos.some(p => p.file === file || p.small === file)) throw fail(404, 'No such picture on this machine.')
  const abs = path.join(photoDir(k, m.id), file)
  if (!fs.existsSync(abs)) throw fail(404, 'The picture is not in the shared folder any more.')
  return { abs, type: TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' }
}
/** The URL of a photo on the local server, for the report and the desktop. */
export const photoUrl = (key, machineId, file) => `/api/kitting/photo?project=${encodeURIComponent(key)}&machine=${encodeURIComponent(machineId)}&file=${encodeURIComponent(file)}`
/** The template onto every machine of the key; answers as GET with `added`. */
export function applyTemplateTo(key) {
  const k = keyOrFail(key)
  const { doc, added } = applyTemplate(docFor(k))
  const view = added ? save(k, doc) : viewFor(k)
  return { ...view, added }
}

// ── the Structured BOM ────────────────────────────────────────────────
// The BOM tool answers only inside the desktop app's signed-in session (bridge.fetchWithSession, see
// sources/bom.js). A server without it says so with a 409 instead of guessing.
const TREE_MS = 5 * 60 * 1000
const trees = new Map()   // BOM machine id -> { at, tree }
async function bomIndex() {
  if (!bridge.desktop || !bridge.fetchWithSession) throw fail(409, 'Needs the desktop app: the Structured BOM answers only inside its signed-in session.')
  const index = await bridge.fetchWithSession(`${BOM_ORIGIN}/`)
  if (!index.ok || /login\.microsoftonline/.test(index.url || '')) throw fail(409, 'Sign in to the Structured BOM on the Tools page first.')
  const ids = [...new Set([...(await index.text()).matchAll(/\/machine\/(\d+)/g)].map(m => m[1]))]
  if (!ids.length) throw fail(409, 'Sign in to the Structured BOM on the Tools page first.')
  return ids
}
async function bomTree(id) {
  const s = String(id ?? '')
  if (!/^\d{1,12}$/.test(s)) throw fail(400, 'Name the BOM machine by its number in the BOM tool.')
  const hit = trees.get(s)
  if (hit && Date.now() - hit.at < TREE_MS) return hit.tree
  if (!bridge.desktop || !bridge.fetchWithSession) throw fail(409, 'Needs the desktop app: the Structured BOM answers only inside its signed-in session.')
  const r = await bridge.fetchWithSession(`${BOM_ORIGIN}/api/machine/${s}`, { headers: { accept: 'application/json' } })
  if (!r.ok) throw fail(r.status === 404 ? 404 : 409, r.status === 404 ? 'The BOM has no such machine.' : 'The BOM did not answer. Sign in on the Tools page and try again.')
  const tree = await r.json()
  trees.set(s, { at: Date.now(), tree })
  return tree
}
/** The assemblies of a BOM tree to pick from: id, number and name, depth, and how many parts sit below. Pure. */
export function bomBranches(tree, limit = 400) {
  const out = []
  const walk = (n, depth) => {
    if (!n || typeof n !== 'object' || out.length >= limit) return
    const children = Array.isArray(n.children) ? n.children : []
    if (children.length && n.id !== undefined && n.id !== null) {
      const parts = itemsFromBom(n, String(n.id)).length
      out.push({ id: String(n.id), label: `${n.full_number || n.part_number || ''} ${n.name || ''}`.replace(/\s+/g, ' ').trim() || String(n.id), depth, parts })
    }
    children.forEach(c => walk(c, depth + 1))
  }
  for (const c of Array.isArray(tree?.children) ? tree.children : []) walk(c, 0)
  return out
}
export async function bomMachines() {
  const ids = await bomIndex()
  const out = []
  for (const id of ids.slice(0, 40)) {
    try { const t = await bomTree(id); out.push({ id, name: String(t?.name || `Machine ${id}`) }) } catch { out.push({ id, name: `Machine ${id}` }) }
  }
  return out
}
/** The parts under `rootId` of BOM machine `bomMachine`, added to kit machine `machineId`; answers as GET with `added`. */
export async function fillFromBom(key, machineId, { bomMachine, rootId } = {}) {
  const k = keyOrFail(key)
  const doc = docFor(k)
  const m = doc.machines.find(x => x.id === machineId)
  if (!m) throw fail(404, 'That machine is not on this kit any more.')
  const tree = await bomTree(bomMachine)
  const items = itemsFromBom(tree, rootId === undefined || rootId === null || rootId === '' ? null : String(rootId))
  if (!items.length) throw fail(404, 'The BOM has no parts under that node.')
  const r = mergeItems(m.items, items)
  const next = { ...doc, machines: doc.machines.map(x => x.id === m.id ? { ...x, items: r.items } : x) }
  const view = r.added ? save(k, next) : viewFor(k)
  return { ...view, added: r.added }
}

// ── the handover report ───────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const escDefault = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const fmtDefault = iso => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : '' }
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const qtyText = i => `${Number.isInteger(i.qty) ? i.qty : String(i.qty).replace('.', ',')}${i.unit ? ` ${i.unit}` : ''}`

// The black-on-white A4 page of report.js, with the marks and the sign-off this document adds.
const CSS = `
@page { size: A4; margin: 16mm 16mm 18mm; }
* { box-sizing: border-box; }
html { background: #fff; }
body { margin: 0 auto; max-width: 180mm; padding: 12mm 0; color: #111; background: #fff; font: 10pt/1.45 "Segoe UI", "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print { body { padding: 0; max-width: none; } }
header { border-bottom: 1.5pt solid #111; padding-bottom: 5mm; margin-bottom: 6mm; }
.kicker { font-size: 9pt; letter-spacing: .06em; text-transform: uppercase; color: #555; margin: 0; }
h1 { font-size: 22pt; line-height: 1.1; margin: 2mm 0 1mm; font-weight: 650; }
.meta { color: #555; margin: 0; }
h2 { font-size: 15pt; margin: 0 0 1mm; font-weight: 650; break-after: avoid; }
h3 { font-size: 10.5pt; font-weight: 650; margin: 5mm 0 1mm; break-after: avoid; }
.figs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; margin: 0 0 4mm; }
.fig b { display: block; font-size: 14pt; font-weight: 650; }
.fig span { color: #555; font-size: 8.5pt; }
.late { color: #b3261e; }
table { width: 100%; border-collapse: collapse; margin-top: 1mm; }
th { text-align: left; font-size: 8.5pt; font-weight: 600; color: #555; border-bottom: .8pt solid #111; padding: 1.2mm 2mm 1.2mm 0; }
td { border-bottom: .5pt solid #ccc; padding: 1.4mm 2mm 1.4mm 0; vertical-align: top; font-size: 9pt; }
tr { break-inside: avoid; }
td.n, th.n { text-align: right; white-space: nowrap; }
td.c, th.c { text-align: center; white-space: nowrap; width: 12mm; padding-right: 0; }
td.nw, th.nw { white-space: nowrap; }
.none { color: #777; margin: 1mm 0; }
.note { color: #555; font-size: 8.5pt; margin: .6mm 0 0; }
.link { font-size: 8.5pt; color: #333; word-break: break-all; margin: .6mm 0 0; }
table.items { table-layout: fixed; margin-top: 3mm; }
table.items col.tick { width: 15mm; }
table.items col.part { width: 40mm; }
table.items col.qty { width: 16mm; }
table.items td { overflow-wrap: anywhere; }
tr.kind th { font-size: 9.5pt; font-weight: 650; color: #111; border-bottom: .5pt solid #999; padding: 4mm 0 1.2mm; break-after: avoid; }
.box { display: inline-block; width: 3.2mm; height: 3.2mm; border: .8pt solid #111; border-radius: .6mm; vertical-align: -0.5mm; }
.box.on { background: #111; position: relative; }
.box.on::after { content: "\\2713"; position: absolute; inset: 0; color: #fff; font-size: 7pt; line-height: 3mm; text-align: center; font-weight: 700; }
@media screen { .machine + .machine { margin-top: 12mm; padding-top: 6mm; border-top: 1.5pt solid #111; } }
.na { color: #999; }
.machine { margin-top: 9mm; }
.machine + .machine { break-before: page; margin-top: 0; }
ul.open { margin: 1mm 0 0; padding-left: 4.5mm; }
ul.open li { margin: .6mm 0; break-inside: avoid; }
.sign { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 10mm; break-inside: avoid; }
.sign div { border-top: .8pt solid #111; padding-top: 1.5mm; font-size: 8.5pt; color: #555; }
footer { margin-top: 9mm; padding-top: 2mm; border-top: .5pt solid #ccc; color: #777; font-size: 8pt; }
.photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-top: 2mm; }
.photos figure { margin: 0; break-inside: avoid; }
.photos img { display: block; width: 100%; height: 40mm; object-fit: cover; border: .5pt solid #ccc; border-radius: 1mm; background: #f2f2f2; }
.photos figcaption { font-size: 8.5pt; color: #333; margin-top: 1mm; overflow-wrap: anywhere; }
.photos figcaption span { display: block; color: #777; font-size: 8pt; }
`
const box = (on, label) => `<span class="box${on ? ' on' : ''}" role="img" aria-label="${on ? `${label}: yes` : `${label}: no`}"></span>`

/**
 * The handover document for Service: "Übergabe an den Service: <plan>", the date, the overview of every machine
 * number with its bundle and where it stands, the presentation check and the sign-off; then one page per
 * machine (`break-before: page` from the second on) with every item by kind, its marks for kitted, checked and
 * stock, part number, quantity, link written out, the machine's photos as a small grid with their captions, and the
 * open points. Everything from a person goes through `esc`. Pure: the whole HTML page as a string.
 *
 * Photos are <img> tags on the local server's photo route (`photoSrc`), the reduced copy when there is one, so
 * the hidden print window of the desktop app (javascript off, loaded from the same server) fetches them like any
 * picture and the HTML stays small. The grid shows each at 40 mm high; a photo without a reduced copy goes into
 * the PDF at the size it was stored (the phone and the desktop send at most 1600 px).
 */
export function kittingReportHtml(doc, { esc = escDefault, fmt = fmtDefault, today = isoToday(), title = '', author = '', print = false, photoSrc = null } = {}) {
  const d = cleanDoc(doc || {}, doc?.project ?? null)
  const srcOf = photoSrc || ((m, p) => d.project ? photoUrl(d.project, m.id, p.small || p.file) : null)
  const name = String(title || d.project || '').replace(/^plan:/, '') || 'Kit'
  const heading = `Übergabe an den Service: ${name}`
  const { overall, machines: prog } = planProgress(d)
  const b = bundleCheck(d)
  const complete = kitCompleteDoc(d)
  const pOf = id => prog.find(p => p.id === id)
  const bundleText = m => m.bundle ? `Bundle ${m.bundle}` : 'no bundle'

  const fig = (value, label, late = false) => `<div class="fig"><b${late ? ' class="late"' : ''}>${esc(value)}</b><span>${esc(label)}</span></div>`
  const figs = `<div class="figs">
${fig(`${overall.complete} of ${overall.machines}`, overall.machines === 1 ? 'machine complete' : 'machines complete', overall.machines > 0 && overall.complete < overall.machines)}
${fig(`${overall.kitted} of ${overall.total}`, 'items kitted')}
${fig(`${overall.checked} of ${overall.total}`, 'items checked')}
${fig(`${overall.stock} of ${overall.stockNeeded}`, 'stock updated')}
</div>`
  const shown = list => list.length ? esc(list.join(', ')) : '<span class="late">none yet</span>'
  const presentation = `<p class="meta">Presented from Bundle 1 to 5: ${shown(b.bundle1to5)}. From Bundle 6: ${shown(b.bundle6)}.</p>`
  const state = complete === null ? 'No machines on the kit yet.' : complete ? 'Every machine is kitted, checked and booked.' : `${plural(overall.open, 'item')} still open.`

  const overviewRows = d.machines.map(m => {
    const p = pOf(m.id)
    return `<tr><td class="nw"><b>${esc(m.number)}</b>${m.label ? ` ${esc(m.label)}` : ''}</td><td class="nw">${esc(bundleText(m))}</td><td class="n">${p.kitted}/${p.total}</td><td class="n">${p.checked}/${p.total}</td><td class="n">${p.stock}/${p.stockNeeded}</td><td class="nw">${p.complete ? 'complete' : `<span class="late">${esc(plural(p.open, 'open item'))}</span>`}</td><td class="nw">${esc(fmt(m.presentedOn))}</td><td class="nw">${esc(fmt(m.handedOverOn))}</td></tr>`
  })
  const overview = d.machines.length
    ? `<table><thead><tr><th>Machine</th><th>Bundle</th><th class="n">Kitted</th><th class="n">Checked</th><th class="n">Stock</th><th>State</th><th>Presented</th><th>Handed over</th></tr></thead><tbody>${overviewRows.join('')}</tbody></table>`
    : '<p class="none">No machines on the kit yet.</p>'

  const itemRow = i => {
    const extra = [i.note ? `<p class="note">${esc(i.note)}</p>` : '', i.link ? `<p class="link">${esc(i.link)}</p>` : ''].join('')
    return `<tr><td class="c">${box(i.kitted, 'Kitted')}</td><td class="c">${box(i.checked, 'Checked')}</td><td class="c">${needsStock(i) ? box(i.stockUpdated, 'Stock updated') : '<span class="na">n/a</span>'}</td><td>${esc(i.name)}${extra}</td><td class="nw">${esc(i.partNumber)}</td><td class="n">${esc(qtyText(i))}</td></tr>`
  }
  const machineHtml = m => {
    const p = pOf(m.id)
    const groups = KINDS.map(k => [k, m.items.filter(i => i.kind === k)]).filter(([, l]) => l.length)
    // one table per machine, so the columns line up from Kabel to Doku; a kind is a row of its own
    const tables = groups.length ? `<table class="items"><colgroup><col class="tick"><col class="tick"><col class="tick"><col><col class="part"><col class="qty"></colgroup>
<thead><tr><th class="c">Kitted</th><th class="c">Checked</th><th class="c">Stock</th><th>Item</th><th>Part number</th><th class="n">Qty</th></tr></thead><tbody>${
  groups.map(([k, list]) => `<tr class="kind"><th colspan="6">${esc(KIND_LABEL[k])} (${list.length})</th></tr>${list.map(itemRow).join('')}`).join('')}</tbody></table>` : ''
    const open = m.items.filter(i => !itemDone(i))
    const openHtml = open.length
      ? `<ul class="open">${open.map(i => `<li>${esc(i.name)}${i.partNumber ? ` (${esc(i.partNumber)})` : ''}: ${esc(missing(i).join(', '))}.</li>`).join('')}</ul>`
      : `<p class="none">${m.items.length ? 'None. Every item is kitted, checked and booked.' : 'No items on this machine yet.'}</p>`
    const facts = [bundleText(m), m.label, `${p.kitted} of ${p.total} kitted`, `${p.checked} of ${p.total} checked`, `stock updated for ${p.stock} of ${p.stockNeeded}`,
      m.presentedOn ? `presented ${fmt(m.presentedOn)}` : null, m.handedOverOn ? `handed over ${fmt(m.handedOverOn)}` : null].filter(Boolean)
    const figure = p => {
      const src = srcOf(m, p)
      const item = p.itemId ? m.items.find(i => i.id === p.itemId) : null
      const caption = p.caption || (item ? item.name : `Machine ${m.number}`)
      const sub = [item && p.caption ? item.name : null, p.at ? fmt(p.at.slice(0, 10)) : null].filter(Boolean).join(', ')
      return `<figure>${src ? `<img src="${esc(src)}" alt="${esc(caption)}">` : ''}<figcaption>${esc(caption)}${sub ? `<span>${esc(sub)}</span>` : ''}</figcaption></figure>`
    }
    const photos = m.photos?.length ? `<h3>Photos (${m.photos.length})</h3><div class="photos">${m.photos.map(figure).join('')}</div>` : ''
    return `<section class="machine">
<h2>Machine ${esc(m.number)}</h2>
<p class="meta">${esc(facts.join(', '))}.</p>
${m.notes ? `<p class="note" style="white-space:pre-line">${esc(m.notes)}</p>` : ''}
${tables || '<p class="none">No items on this machine yet.</p>'}
${photos}
<h3>Open points</h3>${openHtml}
</section>`
  }

  const meta = [author ? `Prepared by ${author}` : null, fmt(today), plural(d.machines.length, 'machine')].filter(Boolean).join(' · ')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(heading)}</title><style>${CSS}</style></head><body>
<header><p class="kicker">Rüsten, handover to Service</p><h1>${esc(heading)}</h1><p class="meta">${esc(meta)}</p></header>
${figs}
<p class="meta">${esc(state)}</p>
${presentation}
<h3>Machines</h3>
${overview}
<div class="sign"><div>Handed over by, date</div><div>Taken over by Service, date</div></div>
${d.machines.map(machineHtml).join('\n')}
<footer>Handover of ${esc(fmt(today))}. Made with Bench. From here on execution is with Service.</footer>
${print ? '<script>addEventListener("load", () => setTimeout(() => print(), 200))</script>' : ''}
</body></html>`
}

// ── routes ────────────────────────────────────────────────────────────
const sendHtml = (res, html) => res.set('Cache-Control', 'no-store').type('html').send(html)
function handover(req, res, key) {
  const view = viewFor(key)
  sendHtml(res, kittingReportHtml(view.doc, { today: isoToday(), title: view.plan.name, author: me() || '', print: req.query.print === '1' }))
}

export function registerRoutes(app) {
  app.get('/api/kitting', wrap((req, res) => res.json(viewFor(req.query.project))))
  app.put('/api/kitting', wrap((req, res) => res.json(save(req.query.project, req.body, { keepTicks: req.query.keep === 'ticks' }))))
  app.get('/api/kitting/jobs', wrap((_req, res) => res.json({ jobs: jobs() })))
  app.patch('/api/kitting/tick', wrap((req, res) => res.json(tick(req.query.project, req.body || {}))))
  const raw = express.raw({ type: () => true, limit: PHOTO_MAX_BYTES + 1 })
  const one = v => typeof v === 'string' ? v : ''
  app.post('/api/kitting/photo', (req, res, next) => raw(req, res, err => err ? res.status(err.status === 413 ? 413 : 400).json({ error: err.status === 413 ? 'That picture is over 12 MB.' : 'The picture did not arrive whole.' }) : next()),
    wrap((req, res) => {
      const { project, machine } = req.query
      if (req.query.rendition === 'small') return res.json(addSmall(project, one(machine), one(req.query.photo), req.body))
      res.json(addPhoto(project, one(machine), req.body, { caption: one(req.query.caption), itemId: one(req.query.item) }))
    }))
  app.get('/api/kitting/photo', wrap((req, res) => {
    const { abs, type } = photoFile(req.query.project, one(req.query.machine), one(req.query.file))
    res.set('Cache-Control', 'private, max-age=3600').type(type).sendFile(abs)
  }))
  app.patch('/api/kitting/photo', wrap((req, res) => res.json(editPhoto(req.query.project, one(req.query.machine), one(req.query.photo), { caption: req.body?.caption }))))
  app.delete('/api/kitting/photo', wrap((req, res) => res.json(editPhoto(req.query.project, one(req.query.machine), one(req.query.photo), { remove: true }))))
  app.post('/api/kitting/apply-template', wrap((req, res) => res.json(applyTemplateTo(req.query.project))))
  app.get('/api/kitting/bom', wrap(async (req, res) => {
    if (req.query.machine) { const t = await bomTree(req.query.machine); return res.json({ id: String(req.query.machine), name: String(t?.name || ''), branches: bomBranches(t) }) }
    res.json({ machines: await bomMachines() })
  }))
  app.post('/api/kitting/from-bom', wrap(async (req, res) => res.json(await fillFromBom(req.query.project, String(req.query.machine || ''), req.body || {}))))
  app.get('/api/report/handover', wrap((req, res) => handover(req, res, req.query.project)))
  app.get('/api/report/handover/:project', wrap((req, res) => handover(req, res, req.params.project)))
}
