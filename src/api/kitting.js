/** Rüsten per machine number (server/kitting.js, roadmap 171). The key is "plan:<id>" (an I-code works too). */
import { j, H } from './http.js'
const q = (path, key, extra = '') => `/api/kitting${path}?project=${encodeURIComponent(key)}${extra}`
/** { doc, progress, complete, bundles, plan } */
export const getKit = (key) => fetch(q('', key)).then(j)
/** Saves the whole document; answers like getKit with the cleaned one. */
export const saveKit = (key, doc) => fetch(q('', key), { method: 'PUT', headers: H, body: JSON.stringify(doc) }).then(j)
/** The template onto every machine, only what is missing; answers like getKit plus `added`. */
export const applyKitTemplate = (key) => fetch(q('/apply-template', key), { method: 'POST' }).then(j)
/** The Structured BOM's machines ({ machines }), or one machine's assemblies ({ id, name, branches }). Desktop only: 409 otherwise. */
export const getBom = (bomMachine) => fetch(`/api/kitting/bom${bomMachine ? `?machine=${encodeURIComponent(bomMachine)}` : ''}`).then(j)
/** The parts under a BOM node onto one machine of the kit; answers like getKit plus `added`. */
export const fillKitFromBom = (key, machineId, body) => fetch(q('/from-bom', key, `&machine=${encodeURIComponent(machineId)}`), { method: 'POST', headers: H, body: JSON.stringify(body) }).then(j)
/** The route of the handover report, for exportReport (a path segment, so ?print=1 can follow). */
export const handoverRoute = (key) => `/api/report/handover/${encodeURIComponent(key)}`
