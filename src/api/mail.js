/** Procurement that reads the mail, and the supplier view (server/mail.js, roadmap 113). */
import { j, H } from './http.js'

/** { on, lastRun, matched, reason } */
export const getMailStatus = () => fetch('/api/mail/status').then(j)
/** Read the inbox now; answers the run result merged with the status. */
export const runMail = () => fetch('/api/mail/run', { method: 'POST', headers: H, body: '{}' }).then(j)
/** [{ supplier, open, ordered, delivered, medianDays, hitRate, openPOs: [{ id, title, poNumber, orderedOn, dueDate }] }] */
export const getSuppliers = () => fetch('/api/suppliers').then(j)
