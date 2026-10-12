/**
 * The rules of Rüsten (roadmap 171), pure: no files, no network, so the tab (src/components/Kitting.jsx) and
 * the server (kitting.js) count, clean and merge the same way. kitting.js re-exports all of it.
 *
 * A kit document is { project, template: [item], machines: [machine], updatedAt, by }.
 *   machine  { id, number ("000 030"), bundle (1 to 8 or null), label, items: [item], presentedOn, handedOverOn, notes, photos: [photo] }
 *   item     { id, kind, name, partNumber, qty, unit, kitted, checked, stockUpdated, note, link, tpl?, bom? }
 *   photo    { id, file, at, caption?, itemId?, small? }   (roadmap 176) the picture is a file in the shared folder
 *            (kitting.js says where), never inside the document; `small` is the reduced copy the handover uses.
 * `tpl` is the id of the template item a machine's item came from, `bom` the BOM node it was filled from;
 * both let a second apply or a second fill add only what is missing.
 */

export const KINDS = ['kabel', 'verbindung', 'schraube', 'teil', 'stueckliste', 'schema', 'doku']
/** The group names on the tab and in the handover, in this order. */
export const KIND_LABEL = { kabel: 'Kabel', verbindung: 'Verbindungen', schraube: 'Schrauben', teil: 'Teile', stueckliste: 'Stückliste', schema: 'Schema', doku: 'Doku' }
/** One of each, for a field that names a single item's kind. */
export const KIND_ONE = { kabel: 'Kabel', verbindung: 'Verbindung', schraube: 'Schraube', teil: 'Teil', stueckliste: 'Stückliste', schema: 'Schema', doku: 'Doku' }
/** The kinds that come out of the store: these need their stock booked before a machine counts as kitted. */
export const STOCK_KINDS = ['teil', 'kabel', 'schraube']
export const needsStock = item => STOCK_KINDS.includes(item?.kind)
export const MAX = { machines: 60, items: 300, name: 160, partNumber: 80, unit: 16, note: 500, link: 1000, label: 80, number: 40, notes: 2000, qty: 100000, photos: 40, caption: 200 }
/** A photo's file name as the server makes it: letters, digits, dash and underscore, then the type. Nothing else is ever opened. */
export const PHOTO_FILE = /^[\w-]{1,120}\.(?:jpg|png|webp|heic)$/

const uid = () => globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `k-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
const str = (v, max) => typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim().slice(0, max) : ''
const text = (v, max) => typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : ''
const soundId = v => typeof v === 'string' && /^[\w-]{1,64}$/.test(v)
const flag = v => v === true
const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
export function isoDate(v) {
  const s = String(v ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T12:00:00Z')
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s
}

/**
 * A machine number as TomFit writes it: up to six digits become "000 030" (so "30", "000030" and "000 030"
 * are one machine); anything else is kept as typed, trimmed, at most 40 characters.
 */
export function normNumber(v) {
  const s = str(v, MAX.number)
  if (/^[\d\s]+$/.test(s)) {
    const digits = s.replace(/\s/g, '')
    if (digits.length && digits.length <= 6) { const p = digits.padStart(6, '0'); return `${p.slice(0, 3)} ${p.slice(3)}` }
  }
  return s
}
/** 1 to 8, or null. Accepts 3, "3", "Bundle 3" and "B3". */
export function normBundle(v) {
  if (v === null || v === undefined || v === '') return null
  const m = /^(?:bundle|b)?\s*(\d+)$/i.exec(String(v).trim())
  const n = m ? Number(m[1]) : NaN
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : null
}
const qtyOf = v => {
  if (v === null || v === undefined || String(v).trim() === '') return 1
  const n = Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.min(MAX.qty, Math.round(n * 1000) / 1000)
}

// ── cleaning ──────────────────────────────────────────────────────────
/** One item as it may be stored, or null when it has no name. Unknown kinds become 'teil'. */
export function cleanItem(input, { reset = false } = {}) {
  if (!input || typeof input !== 'object') return null
  const name = str(input.name, MAX.name)
  if (!name) return null
  const kind = KINDS.includes(input.kind) ? input.kind : 'teil'
  const out = {
    id: soundId(input.id) ? input.id : uid(), kind, name,
    partNumber: str(input.partNumber, MAX.partNumber), qty: qtyOf(input.qty), unit: str(input.unit, MAX.unit),
    kitted: reset ? false : flag(input.kitted), checked: reset ? false : flag(input.checked), stockUpdated: reset ? false : flag(input.stockUpdated),
    note: text(input.note, MAX.note), link: str(input.link, MAX.link)
  }
  if (soundId(input.tpl)) out.tpl = input.tpl
  if (typeof input.bom === 'string' || typeof input.bom === 'number') { const b = str(input.bom, 64); if (b) out.bom = b }
  return out
}
/** A list of items: cleaned, ids unique, at most 300. */
export function cleanItems(list, opts) {
  const out = [], ids = new Set()
  for (const raw of Array.isArray(list) ? list : []) {
    const it = cleanItem(raw, opts)
    if (!it) continue
    if (ids.has(it.id)) it.id = uid()
    ids.add(it.id); out.push(it)
    if (out.length >= MAX.items) break
  }
  return out
}
/** One machine, or null without a number. */
export function cleanMachine(input) {
  if (!input || typeof input !== 'object') return null
  const number = normNumber(input.number)
  if (!number) return null
  return {
    id: soundId(input.id) ? input.id : uid(), number, bundle: normBundle(input.bundle), label: str(input.label, MAX.label),
    items: cleanItems(input.items), presentedOn: isoDate(input.presentedOn), handedOverOn: isoDate(input.handedOverOn),
    notes: text(input.notes, MAX.notes), photos: cleanPhotos(input.photos)
  }
}
/** One photo reference, or null when its file name is not one the server would make. */
export function cleanPhoto(input) {
  if (!input || typeof input !== 'object' || typeof input.file !== 'string' || !PHOTO_FILE.test(input.file)) return null
  const t = typeof input.at === 'string' ? Date.parse(input.at) : NaN
  const out = { id: soundId(input.id) ? input.id : uid(), file: input.file, at: Number.isNaN(t) ? null : new Date(t).toISOString() }
  const caption = str(input.caption, MAX.caption)
  if (caption) out.caption = caption
  if (soundId(input.itemId)) out.itemId = input.itemId
  if (typeof input.small === 'string' && PHOTO_FILE.test(input.small) && input.small !== input.file) out.small = input.small
  return out
}
/** A machine's photos: cleaned, ids and files unique, at most 40. A document from before roadmap 176 has none. */
export function cleanPhotos(list) {
  const out = [], ids = new Set(), files = new Set()
  for (const raw of Array.isArray(list) ? list : []) {
    const p = cleanPhoto(raw)
    if (!p || files.has(p.file)) continue
    if (ids.has(p.id)) p.id = uid()
    ids.add(p.id); files.add(p.file); out.push(p)
    if (out.length >= MAX.photos) break
  }
  return out
}
/**
 * The whole document as it may be stored: at most 60 machines (one per number; a second "000 030" is
 * dropped), at most 300 items per machine and in the template, everything trimmed and capped.
 */
export function cleanDoc(input = {}, project = input?.project ?? null) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const machines = [], ids = new Set(), numbers = new Set()
  for (const raw of Array.isArray(src.machines) ? src.machines : []) {
    const m = cleanMachine(raw)
    if (!m || numbers.has(fold(m.number))) continue
    if (ids.has(m.id)) m.id = uid()
    ids.add(m.id); numbers.add(fold(m.number)); machines.push(m)
    if (machines.length >= MAX.machines) break
  }
  return { project, template: cleanItems(src.template), machines, updatedAt: src.updatedAt || null, by: src.by || null }
}

// ── counting ──────────────────────────────────────────────────────────
/**
 * Where one machine stands: how many items are kitted, checked and (for Teile, Kabel and Schrauben) booked out
 * of stock. Complete when it has items and every one is kitted and checked and every stock item is booked.
 * A machine without items is not complete: an empty kit is not a kit.
 */
export function progress(machine) {
  const items = Array.isArray(machine?.items) ? machine.items : []
  const stockItems = items.filter(needsStock)
  const p = {
    total: items.length,
    kitted: items.filter(i => i.kitted === true).length,
    checked: items.filter(i => i.checked === true).length,
    stockNeeded: stockItems.length,
    stock: stockItems.filter(i => i.stockUpdated === true).length
  }
  p.open = items.filter(i => !itemDone(i)).length
  p.complete = p.total > 0 && p.open === 0
  return p
}
/** Is one item done: kitted, checked, and booked when it comes out of the store. */
export const itemDone = i => i?.kitted === true && i?.checked === true && (!needsStock(i) || i?.stockUpdated === true)
/** What an item still lacks, in words, for the open points of the handover. */
export const missing = i => [i?.kitted !== true && 'not kitted', i?.checked !== true && 'not checked', needsStock(i) && i?.stockUpdated !== true && 'stock not updated'].filter(Boolean)

/** Every machine's progress and the sums over the plan. */
export function planProgress(doc) {
  const machines = (Array.isArray(doc?.machines) ? doc.machines : []).map(m => ({ id: m.id, number: m.number, bundle: m.bundle ?? null, ...progress(m) }))
  const sum = k => machines.reduce((n, m) => n + m[k], 0)
  return {
    machines,
    overall: {
      machines: machines.length, complete: machines.filter(m => m.complete).length,
      total: sum('total'), kitted: sum('kitted'), checked: sum('checked'), stockNeeded: sum('stockNeeded'), stock: sum('stock'), open: sum('open'),
      presented: (doc?.machines || []).filter(m => m.presentedOn).length, handedOver: (doc?.machines || []).filter(m => m.handedOverOn).length
    }
  }
}
/**
 * Is the whole kit ready to build: true when every machine is complete, false when one is not, null when the
 * plan has no machines yet (nothing to judge). kitting.js `kitComplete(plan)` loads the plan's kit and asks
 * this; the Paket workflow gates "Bauen" on that.
 */
export function kitCompleteDoc(doc) {
  const machines = Array.isArray(doc?.machines) ? doc.machines : []
  if (!machines.length) return null
  return machines.every(m => progress(m).complete)
}
/**
 * The presentation Roman asked for: at least one presented machine from Bundle 1 to 5 and one from Bundle 6.
 * { ok, bundle1to5: [numbers], bundle6: [numbers] } with the numbers of the presented machines in each group.
 */
export function bundleCheck(doc) {
  const presented = (Array.isArray(doc?.machines) ? doc.machines : []).filter(m => m && m.presentedOn)
  const bundle1to5 = presented.filter(m => m.bundle >= 1 && m.bundle <= 5).map(m => m.number)
  const bundle6 = presented.filter(m => m.bundle === 6).map(m => m.number)
  return { ok: bundle1to5.length > 0 && bundle6.length > 0, bundle1to5, bundle6 }
}

// ── finding ───────────────────────────────────────────────────────────
/**
 * The items that match what was scanned or typed, best first: the part number exactly (spaces, dashes and case do
 * not count, so "TF 100-23" finds "tf10023"), then a part number that starts with it, then one that contains it,
 * then every word of it in the name. An empty query finds nothing.
 * Self-contained on purpose: the phone page (server/phone.js) inlines this function's source, so the phone and
 * the desktop find the same item. Do not reach for anything outside it.
 */
export function findItems(items, query) {
  const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
  const compact = s => fold(s).replace(/[^a-z0-9]/g, '')
  const q = fold(query), qc = compact(query)
  if (!q) return []
  const words = q.split(' ')
  const hits = []
  ;(Array.isArray(items) ? items : []).forEach((it, i) => {
    if (!it || typeof it !== 'object') return
    const pn = compact(it.partNumber), name = fold(it.name)
    let rank = -1
    if (qc && pn && pn === qc) rank = 0
    else if (qc.length >= 2 && pn && pn.startsWith(qc)) rank = 1
    else if (qc.length >= 3 && pn && pn.includes(qc)) rank = 2
    else if (words.every(w => name.includes(w))) rank = 3
    if (rank >= 0) hits.push({ it, rank, i })
  })
  return hits.sort((a, b) => a.rank - b.rank || a.i - b.i).map(h => h.it)
}
/**
 * The next item after `afterId` that is not done, in the order given, wrapping round; null when every one is.
 * `isDone` says what done means (itemDone on the desktop). Self-contained for the phone page, like findItems.
 */
export function nextOpen(list, afterId, isDone) {
  const items = Array.isArray(list) ? list : []
  if (!items.length) return null
  const at = items.findIndex(i => i && i.id === afterId)
  for (let n = 1; n <= items.length; n++) {
    const it = items[(at + n + items.length) % items.length]
    if (it && !isDone(it)) return it
  }
  return null
}
/** A machine's items in the order the tab and the phone show them: by kind (Kabel first), then as entered. */
export const inKindOrder = (items = []) => KINDS.flatMap(k => (Array.isArray(items) ? items : []).filter(i => i.kind === k))

// ── merging ───────────────────────────────────────────────────────────
// the same kind and name, and the same part number unless one of the two has none yet
const sameItem = (a, b) => a.kind === b.kind && fold(a.name) === fold(b.name) && (!a.partNumber || !b.partNumber || fold(a.partNumber) === fold(b.partNumber))
/**
 * The machine's items plus the ones from `source` it does not have yet, as fresh copies with every tick off.
 * An item counts as there when it came from the same template item, the same BOM node, or has the same kind,
 * name and part number (an item without a part number matches the named one with it). Nothing is removed,
 * nothing unticked. Returns { items, added }.
 */
export function mergeItems(items = [], source = [], { fromTemplate = false } = {}) {
  const out = Array.isArray(items) ? items.slice() : []
  let added = 0
  for (const s of Array.isArray(source) ? source : []) {
    if (out.length >= MAX.items) break
    const there = out.some(i => (fromTemplate && i.tpl && i.tpl === s.id) || (s.tpl && i.tpl === s.tpl) || (s.bom && i.bom === s.bom) || sameItem(i, s))
    if (there) continue
    const copy = cleanItem({ ...s, id: undefined, tpl: fromTemplate ? s.id : s.tpl }, { reset: true })
    if (!copy) continue
    out.push(copy); added++
  }
  return { items: out, added }
}
/** The template copied onto every machine: only missing items are added. Returns { doc, added }. Pure. */
export function applyTemplate(doc) {
  const template = Array.isArray(doc?.template) ? doc.template : []
  let added = 0
  const machines = (Array.isArray(doc?.machines) ? doc.machines : []).map(m => {
    const r = mergeItems(m.items, template, { fromTemplate: true })
    added += r.added
    return r.added ? { ...m, items: r.items } : m
  })
  return { doc: { ...doc, machines }, added }
}

/**
 * A pasted list of machines, one per line: "000 030, Bundle 2", "000031; 2", "000 032 B6", "000 033". Lines
 * without a number are skipped. Returns [{ number, bundle }].
 */
export function parsePaste(textIn) {
  const out = []
  for (const raw of String(textIn ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    let number = line, bundle = null
    const named = /^(.*?)[\s,;\t]*\b(?:bundle|b)\s*(\d+)\s*$/i.exec(line)
    const split = /^(.*?)\s*[,;\t]\s*(\d+)\s*$/.exec(line)
    if (named) { number = named[1]; bundle = normBundle(named[2]) } else if (split) { number = split[1]; bundle = normBundle(split[2]) }
    number = normNumber(number.replace(/[,;\t]+$/, ''))
    if (number) out.push({ number, bundle })
  }
  return out
}

// ── the BOM ───────────────────────────────────────────────────────────
/** A kind from a part's name: cables, connectors and fasteners by their usual German and English words. */
export function kindFor(name) {
  const s = fold(name)
  if (/kabelbinder|cable tie|zip tie/.test(s)) return 'teil'
  if (/kabel|cable|leitung|litze|wire|harness|kabelbaum|patch/.test(s)) return 'kabel'
  if (/stecker|buchse|connector|klemme|terminal|plug|socket|verbinder|crimp/.test(s)) return 'verbindung'
  if (/schraube|screw|bolt|mutter|\bnut\b|scheibe|washer|niet|rivet|stift|\bpin\b|din ?912|iso ?4762|\bm\d+(x\d+)?\b/.test(s)) return 'schraube'
  if (/schema|schematic|wiring diagram|schaltplan/.test(s)) return 'schema'
  return 'teil'
}
const pickOf = (node, keys) => { for (const k of keys) { const v = node?.[k]; if (v !== undefined && v !== null && v !== '') return v } return null }
const linkOf = node => {
  const raw = pickOf(node, ['drawing_links', 'drawing_link', 'drawings', 'drawing_url'])
  const first = Array.isArray(raw) ? raw.find(Boolean) : raw
  if (!first) return ''
  if (typeof first === 'string') return first
  return String(pickOf(first, ['url', 'href', 'link', 'path']) || '')
}

/**
 * The parts under a node of the Structured BOM as kit items (Teile unless the name says cable, connector,
 * fastener or schematic). `nodes` is what the BOM sends for a machine: the tree with `children`, an array of
 * such trees, or a flat array that links up through `parent_id`. `rootId` picks the node; without one the whole
 * tree counts. A part is a node without children that is not marked `is_branch`; assemblies are walked through.
 * The same part number twice adds up its quantity. Every tick is off. Returns at most 300 items.
 */
export function itemsFromBom(nodes, rootId = null) {
  const byId = new Map(), kids = new Map(), order = []
  const add = (n, parent) => {
    if (!n || typeof n !== 'object') return
    const id = n.id !== undefined && n.id !== null ? String(n.id) : null
    if (id !== null) {
      if (!byId.has(id)) order.push(id)
      byId.set(id, n)
      const p = parent ?? (n.parent_id !== undefined && n.parent_id !== null ? String(n.parent_id) : null)
      if (p !== null) { if (!kids.has(p)) kids.set(p, []); if (!kids.get(p).includes(id)) kids.get(p).push(id) }
    }
    for (const c of Array.isArray(n.children) ? n.children : []) add(c, id)
  }
  for (const n of Array.isArray(nodes) ? nodes : [nodes]) add(n, null)

  let starts
  if (rootId !== null && rootId !== undefined && rootId !== '') {
    if (!byId.has(String(rootId))) return []
    starts = [String(rootId)]
  } else starts = order.filter(id => { const n = byId.get(id); const p = n.parent_id; return p === undefined || p === null || !byId.has(String(p)) })
  // a whole machine tree (no id of its own, children below) has no root in byId: take every top node
  if (!starts.length) starts = order

  const parts = [], seen = new Set()
  const walk = id => {
    if (seen.has(id)) return
    seen.add(id)
    const n = byId.get(id), below = kids.get(id) || []
    if (below.length) { below.forEach(walk); return }
    if (n.is_branch === true) return
    parts.push(n)
  }
  starts.forEach(walk)

  const out = [], byPart = new Map()
  for (const n of parts) {
    const partNumber = str(pickOf(n, ['full_number', 'part_number', 'number']), MAX.partNumber)
    const name = str(pickOf(n, ['name', 'title', 'description']), MAX.name) || partNumber
    if (!name) continue
    const qty = qtyOf(pickOf(n, ['quantity', 'qty', 'menge', 'anzahl', 'count']))
    if (partNumber && byPart.has(fold(partNumber))) { const it = byPart.get(fold(partNumber)); it.qty = Math.min(MAX.qty, Math.round((it.qty + qty) * 1000) / 1000); continue }
    const note = [n.revision ? `Rev ${n.revision}` : null, n.beschaffungsstatus ? String(n.beschaffungsstatus) : null, n.critical ? 'critical' : null].filter(Boolean).join(', ')
    const item = cleanItem({ id: `bom-${String(n.id).replace(/[^\w-]/g, '').slice(0, 56)}`, kind: kindFor(name), name, partNumber, qty, unit: str(pickOf(n, ['unit', 'einheit']), MAX.unit), note, link: linkOf(n), bom: String(n.id) }, { reset: true })
    if (!item) continue
    out.push(item)
    if (partNumber) byPart.set(fold(partNumber), item)
    if (out.length >= MAX.items) break
  }
  return out
}
