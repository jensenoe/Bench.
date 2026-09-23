import { bridge } from '../bridge.js'

export const ORIGIN = 'https://oetwil-structured-bom.vercel.app'
import { isMe } from '../settings.js'
const DONE = new Set(['released'])
const FIELDS = ['assigned_to', 'assigned_to_mecha', 'assigned_to_elec', 'assigned_to_mech', 'assigned_to_sw']
const LABEL = { assigned_to: 'lead', assigned_to_mecha: 'mecha', assigned_to_elec: 'elec', assigned_to_mech: 'mech', assigned_to_sw: 'sw' }
const pick = (node, ...keys) => { for (const k of keys) { const v = node?.[k]; if (v !== undefined && v !== null && v !== '') return v } return null }
/**
 * The BOM tool's procurement field names are not confirmed (roadmap 9). Exact names are tried first, then any
 * key of the node that matches the pattern: "Lieferant_Name" still counts as the supplier, "eta_datum" as the
 * delivery date. The keys actually seen are reported with the source status, so the diagnostics show the real shape.
 */
const find = (node, exact, pattern) => {
  const v = pick(node, ...exact)
  if (v !== null) return v
  for (const k of Object.keys(node || {})) { if (pattern.test(k)) { const x = node[k]; if (x !== undefined && x !== null && x !== '' && typeof x !== 'object') return x } }
  return null
}
const PATTERNS = {
  supplier: /lieferant|supplier|hersteller|manufacturer|vendor/i,
  leadTime: /liefer.?zeit|lead.?time|wochen|weeks|days_to|lieferfrist/i,
  orderNumber: /bestell.?n|order.?n|po.?n|purchase/i,
  orderedOn: /bestellt|ordered|order.?date|bestelldat/i,
  deliveryDate: /liefer.?(termin|datum)|delivery|eta|arrival|eingang/i,
  needBy: /ben.?tigt|need|required|bedarf|deadline|f.llig/i
}
const num = v => { const n = Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null }
const date = v => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) }

/**
 * Structured BOM: session app, one JSON tree per machine. Assemblies carry
 * up to five discipline assignees; yours are mecha and elec, but we take any.
 */
export async function fetchBom() {
  if (!bridge.desktop) return { ok: false, reason: 'desktop-only' }
  const index = await bridge.fetchWithSession(`${ORIGIN}/`)
  if (!index.ok || /login\.microsoftonline/.test(index.url)) return { ok: false, reason: 'needs-signin' }
  const html = await index.text()
  const ids = [...new Set([...html.matchAll(/\/machine\/(\d+)/g)].map(m => m[1]))]
  if (!ids.length) return { ok: false, reason: 'needs-signin' }

  const items = []
  const keys = new Set()   // every field name the tool actually sends, for the diagnostics (roadmap 9)
  const walk = (node, machine, machineId) => {
    const roles = FIELDS.filter(f => node[f] && isMe(String(node[f]))).map(f => LABEL[f])
    if (roles.length) {
      const prio = node.assignee_priority_mecha ?? node.assignee_priority_elec ?? node.assignee_priority ?? null
      items.push({
        sourceId: String(node.id),
        title: `${node.full_number || node.part_number || ''} ${node.name}`.trim(),
        status: node.status, done: DONE.has(String(node.status).toLowerCase()),
        dueDate: null, url: `${ORIGIN}/machine/${machineId}`,
        group: machine, subgroup: roles.join(', '),
        meta: {
          machine, prio, roles, critical: !!node.critical, procurement: node.beschaffungsstatus || null, openTickets: (node.tickets || []).length,
          // Procurement side of the part. The field names are the German and English spellings the BOM tool is
          // likely to use; whichever exists wins, the rest stay null until the real shape is confirmed (roadmap 9).
          supplier: find(node, ['lieferant', 'supplier', 'hersteller', 'manufacturer'], PATTERNS.supplier),
          leadTimeDays: num(find(node, ['lieferzeit_tage', 'lead_time_days', 'lieferzeit', 'lead_time'], PATTERNS.leadTime)),
          orderNumber: find(node, ['bestellnummer', 'order_number', 'po_number', 'po'], PATTERNS.orderNumber),
          orderedOn: date(find(node, ['bestellt_am', 'ordered_on', 'order_date'], PATTERNS.orderedOn)),
          deliveryDate: date(find(node, ['liefertermin', 'delivery_date', 'eta'], PATTERNS.deliveryDate)),
          needBy: date(find(node, ['benoetigt_bis', 'need_by', 'needed_by', 'required_date'], PATTERNS.needBy))
        }
      })
    }
    for (const k of Object.keys(node || {})) if (k !== 'children' && k !== 'tickets') keys.add(k)
    ;(node.children || []).forEach(c => walk(c, machine, machineId))
  }
  for (const id of ids) {
    const r = await bridge.fetchWithSession(`${ORIGIN}/api/machine/${id}`, { headers: { accept: 'application/json' } })
    if (!r.ok) continue
    const m = await r.json()
    ;(m.children || []).forEach(c => walk(c, m.name, id))
  }
  return { ok: true, items, machines: ids.length, keys: [...keys].sort().slice(0, 80) }
}
