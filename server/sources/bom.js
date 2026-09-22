import { bridge } from '../bridge.js'

export const ORIGIN = 'https://oetwil-structured-bom.vercel.app'
import { isMe } from '../settings.js'
const DONE = new Set(['released'])
const FIELDS = ['assigned_to', 'assigned_to_mecha', 'assigned_to_elec', 'assigned_to_mech', 'assigned_to_sw']
const LABEL = { assigned_to: 'lead', assigned_to_mecha: 'mecha', assigned_to_elec: 'elec', assigned_to_mech: 'mech', assigned_to_sw: 'sw' }
const pick = (node, ...keys) => { for (const k of keys) { const v = node?.[k]; if (v !== undefined && v !== null && v !== '') return v } return null }
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
          supplier: pick(node, 'lieferant', 'supplier', 'hersteller', 'manufacturer'),
          leadTimeDays: num(pick(node, 'lieferzeit_tage', 'lead_time_days', 'lieferzeit', 'lead_time')),
          orderNumber: pick(node, 'bestellnummer', 'order_number', 'po_number', 'po'),
          orderedOn: date(pick(node, 'bestellt_am', 'ordered_on', 'order_date')),
          deliveryDate: date(pick(node, 'liefertermin', 'delivery_date', 'eta')),
          needBy: date(pick(node, 'benoetigt_bis', 'need_by', 'needed_by', 'required_date'))
        }
      })
    }
    ;(node.children || []).forEach(c => walk(c, machine, machineId))
  }
  for (const id of ids) {
    const r = await bridge.fetchWithSession(`${ORIGIN}/api/machine/${id}`, { headers: { accept: 'application/json' } })
    if (!r.ok) continue
    const m = await r.json()
    ;(m.children || []).forEach(c => walk(c, m.name, id))
  }
  return { ok: true, items, machines: ids.length }
}
