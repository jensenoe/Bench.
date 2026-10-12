/** Rüsten per machine number (server/kitting.js, roadmap 171). The key is "plan:<id>" (an I-code works too). */
import { j, H } from './http.js'
const q = (path, key, extra = '') => `/api/kitting${path}?project=${encodeURIComponent(key)}${extra}`
/** { doc, progress, complete, bundles, plan } */
export const getKit = (key) => fetch(q('', key)).then(j)
/**
 * Saves the whole document; answers like getKit with the cleaned one. The tab ticks through tickKit, so the save
 * keeps the stored ticks (keep=ticks) and a stale document cannot untick what the phone ticked.
 */
export const saveKit = (key, doc) => fetch(q('', key, '&keep=ticks'), { method: 'PUT', headers: H, body: JSON.stringify(doc) }).then(j)
/** One tick on one item (roadmap 176): { item, machine, complete, updatedAt }. */
export const tickKit = (key, machine, item, field, value) => fetch(q('/tick', key), { method: 'PATCH', headers: H, body: JSON.stringify({ machine, item, [field]: value }) }).then(j)
/** Where a kit photo is served on the local server. */
export const kitPhotoUrl = (key, machine, file) => `/api/kitting/photo?project=${encodeURIComponent(key)}&machine=${encodeURIComponent(machine)}&file=${encodeURIComponent(file)}`
/** A photo onto a machine (bytes as a Blob): { photo, photos }. `small` sends the reduced copy of photo `id` instead. */
export const addKitPhoto = (key, machine, blob, { caption = '', item = '' } = {}) => fetch(q('/photo', key, `&machine=${encodeURIComponent(machine)}${item ? `&item=${encodeURIComponent(item)}` : ''}${caption ? `&caption=${encodeURIComponent(caption)}` : ''}`), { method: 'POST', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob }).then(j)
export const addKitPhotoSmall = (key, machine, id, blob) => fetch(q('/photo', key, `&machine=${encodeURIComponent(machine)}&photo=${encodeURIComponent(id)}&rendition=small`), { method: 'POST', headers: { 'Content-Type': blob.type || 'image/jpeg' }, body: blob }).then(j)
export const removeKitPhoto = (key, machine, id) => fetch(q('/photo', key, `&machine=${encodeURIComponent(machine)}&photo=${encodeURIComponent(id)}`), { method: 'DELETE' }).then(j)
/** The phone server: { on, url, addresses, configured }. Never the PIN. */
export const getPhoneInfo = () => fetch('/api/phone').then(j)
/** The template onto every machine, only what is missing; answers like getKit plus `added`. */
export const applyKitTemplate = (key) => fetch(q('/apply-template', key), { method: 'POST' }).then(j)
/** The Structured BOM's machines ({ machines }), or one machine's assemblies ({ id, name, branches }). Desktop only: 409 otherwise. */
export const getBom = (bomMachine) => fetch(`/api/kitting/bom${bomMachine ? `?machine=${encodeURIComponent(bomMachine)}` : ''}`).then(j)
/** The parts under a BOM node onto one machine of the kit; answers like getKit plus `added`. */
export const fillKitFromBom = (key, machineId, body) => fetch(q('/from-bom', key, `&machine=${encodeURIComponent(machineId)}`), { method: 'POST', headers: H, body: JSON.stringify(body) }).then(j)
/** The route of the handover report, for exportReport (a path segment, so ?print=1 can follow). */
export const handoverRoute = (key) => `/api/report/handover/${encodeURIComponent(key)}`
