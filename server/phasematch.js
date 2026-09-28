/**
 * Which phase of a plan a task belongs in (roadmap 134), for tasks that arrive in bulk: a playbook applied
 * to a planned machine, a project started from a playbook. The playbook's own phase name wins when the plan
 * has a phase of that name; otherwise the title and the supplier decide, by the words a commissioning plan
 * uses. Null when nothing fits: the task then waits under "No phase yet" for a hand to place it.
 *
 * Kept apart from projects.js and playbooks.js so both can use it without importing each other.
 */
import * as db from './db.js'

// most specific first: "Safety relay test" is electrical work, "FAT protocol" is the test
const RULES = [
  { task: /design|drawing|cad|konstruk|zeichnung|layout/i, phase: /design|konstrukt|engineering/i },
  { task: /\border\b|bestell|procure|beschaff|quote|offer|angebot/i, phase: /procure|beschaff|order|bestell|purchas/i },
  { task: /electr|elektr|wiring|verdraht|cabinet|schaltschrank|safety relay|sensor|earth|insulation/i, phase: /electr|elektr/i },
  { task: /software|\bplc\b|\bsps\b|program|parameter|firmware|\bhmi\b/i, phase: /software|plc|sps|program/i },
  { task: /\bfat\b|\bsat\b|test|protocol|protokoll|commission|inbetrieb|dry run/i, phase: /test|fat|commission|inbetrieb|abnahme/i },
  { task: /handover|übergabe|manual|handbuch|training|schulung|documentation|dokumentation/i, phase: /handover|übergabe|delivery|auslieferung/i },
  { task: /mechan|assembl|montage|weld|schweiss|frame|rahmen|mount|torque|alignment|incoming|inspection|guard/i, phase: /mechan|assembl|montage|build/i }
]

/** The phase id for one task in a list of phases [{ id, name }], or null. `task` has title, supplier and maybe phase (a name). */
export function matchPhase(task = {}, phases = []) {
  if (!phases.length) return null
  const byName = n => phases.find(p => p.name.trim().toLowerCase() === String(n || '').trim().toLowerCase())
  if (task.phase && byName(task.phase)) return byName(task.phase).id
  const title = String(task.title || '')
  if (task.supplier) { const p = phases.find(ph => RULES[1].phase.test(ph.name)); if (p) return p.id }
  for (const r of RULES) {
    if (!r.task.test(title)) continue
    const p = phases.find(ph => r.phase.test(ph.name))
    if (p) return p.id
  }
  return null
}

/** The plan of a machine, read straight from the projects collection: { id, phases } or null. */
export function planOf(machine) {
  const m = String(machine || '').trim().toLowerCase(); if (!m) return null
  try {
    const c = db.collection('projects')
    if (!c.exists()) return null
    const items = c.read().items || []
    return items.find(p => !p.archived && (p.machine || '').trim().toLowerCase() === m && (p.phases || []).length) || null
  } catch { return null }
}
