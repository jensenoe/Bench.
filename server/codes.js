/**
 * Innovation project codes (roadmap 143). "I-1050 Handgrip strength": the code is the project, wherever it
 * appears (a Planner card's title, a task's project field, a Logbook entry, a Napkin map, a Teams folder).
 * Kept apart so projects.js and portfolio.js share it without importing each other.
 */
export const CODE_RE = /\bI-(\d{3,5})\b/i
/** "I-1050" from any text, upper-cased, or null. */
export const codeOf = s => { const m = CODE_RE.exec(String(s || '')); return m ? `I-${m[1]}` : null }
/** Does the text name this code as a whole word ("I-1050" but not "I-10500")? */
export const mentions = (text, code) => Boolean(code) && new RegExp(`(^|[^\\w-])${code.replace('-', '\\-')}(?![\\w])`, 'i').test(String(text || ''))
/** "Handgrip strength" from "I-1050 Handgrip strength" or "I-1050: Handgrip strength". */
export const nameOf = (title, code) => String(title || '').replace(new RegExp(`(^|\\s)${code.replace('-', '\\-')}\\s*[-:–]?\\s*`, 'i'), '$1').trim() || code
