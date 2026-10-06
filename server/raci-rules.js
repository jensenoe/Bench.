/**
 * The rules of a RACI matrix (roadmap 169), kept pure so the server (raci.js) and the grid
 * (src/components/Raci.jsx) read them from one place. No imports: Vite bundles this file into the UI.
 *
 *   R  Responsible   does the work
 *   A  Accountable   owns the outcome, one per row
 *   C  Consulted     asked before
 *   I  Informed      told after
 *   AR               owns the outcome and does the work too
 *
 *   checkRow(cells)   problems of one row: no A, more than one A, no R
 *   check(matrix)     every row's problems, plus soft hints per person (only I, no letter at all)
 */
export const LETTERS = ['R', 'A', 'AR', 'C', 'I']
/** What a click (or Enter) walks through: empty, R, A, AR, C, I, empty. */
export const CYCLE = ['', 'R', 'A', 'AR', 'C', 'I']
export const LABEL = { R: 'Responsible', A: 'Accountable', AR: 'Accountable and responsible', C: 'Consulted', I: 'Informed' }
export const MAX_ROWS = 40
export const MAX_PEOPLE = 16

/** A letter from anything: case is ignored, "RA" is "AR"; null when it is not one of the five. */
export function normLetter(v) {
  const s = String(v ?? '').toUpperCase().replace(/\s+/g, '')
  const l = s === 'RA' ? 'AR' : s
  return LETTERS.includes(l) ? l : null
}
/** The next letter in the cycle. */
export const nextLetter = cur => CYCLE[(CYCLE.indexOf(normLetter(cur) || '') + 1) % CYCLE.length]
/**
 * A typed letter on a cell: R on an A (or A on an R) makes AR, the same letter again takes it back off,
 * anything else replaces what is there.
 */
export function typeLetter(cur, key) {
  const c = normLetter(cur) || '', k = String(key || '').toUpperCase()
  if (!['R', 'A', 'C', 'I'].includes(k)) return c
  if ((c === 'A' && k === 'R') || (c === 'R' && k === 'A')) return 'AR'
  if (c === 'AR' && (k === 'A' || k === 'R')) return k === 'A' ? 'R' : 'A'
  return c === k ? '' : k
}
/** A name folded for comparing: no accents, no case, single spaces ("Noël  Jensen" equals "noel jensen"). */
export const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six']
const count = n => words[n] || String(n)

/** Problems of one row, from its cells ({ person: letter }). Empty when the row is sound. */
export function checkRow(cells = {}) {
  const letters = Object.values(cells || {}).map(normLetter).filter(Boolean)
  const a = letters.filter(l => l === 'A' || l === 'AR').length
  const r = letters.filter(l => l === 'R' || l === 'AR').length
  const out = []
  if (a === 0) out.push({ code: 'noA', severity: 'problem', short: 'No A', text: 'Nobody owns the outcome. Give one person the A.' })
  if (a > 1) out.push({ code: 'manyA', severity: 'problem', short: `${count(a)} A`, text: `${count(a)} people own the outcome. Keep one A and make the others R or C.` })
  if (r === 0) out.push({ code: 'noR', severity: 'problem', short: 'No R', text: 'Nobody does the work. Give someone the R, or AR when the owner does it too.' })
  return out
}

/**
 * The whole matrix: { rows: { rowId: problems }, people: { name: hints }, list, count }. `list` is every
 * problem and hint in reading order, each with its rowId and activity or its person; `count` is the
 * number of problems (hints are not counted). A person hint is soft: only informed on every row, or no
 * letter at all (then the column can go).
 */
export function check(matrix = {}) {
  const people = Array.isArray(matrix.people) ? matrix.people : []
  const rows = Array.isArray(matrix.rows) ? matrix.rows : []
  const cells = matrix.cells || {}
  const out = { rows: {}, people: {}, list: [], count: 0 }
  for (const row of rows) {
    const mine = cells[row.id] || {}
    const problems = checkRow(Object.fromEntries(people.map(p => [p, mine[p]])))
    out.rows[row.id] = problems
    for (const p of problems) out.list.push({ ...p, rowId: row.id, activity: row.activity })
  }
  if (rows.length) {
    for (const person of people) {
      const letters = rows.map(r => normLetter(cells[r.id]?.[person])).filter(Boolean)
      const hints = []
      if (!letters.length) hints.push({ code: 'unused', severity: 'hint', short: 'No letter', text: `${person} has no letter on any row. Remove the column, or give them a part.` })
      else if (letters.every(l => l === 'I')) hints.push({ code: 'onlyI', severity: 'hint', short: 'Only I', text: `${person} is only told after, on every row. Fine for a sponsor; otherwise the column may not be needed.` })
      out.people[person] = hints
      for (const h of hints) out.list.push({ ...h, person })
    }
  }
  out.count = out.list.filter(x => x.severity === 'problem').length
  return out
}
