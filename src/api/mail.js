/** Reading order confirmations and delivery notes from the mail (server/mail.js, roadmap 113). The supplier view went with Procurement (roadmap 173). */
import { j, H } from './http.js'

/** { on, lastRun, matched, reason } */
export const getMailStatus = () => fetch('/api/mail/status').then(j)
/** Read the inbox now; answers the run result merged with the status. */
export const runMail = () => fetch('/api/mail/run', { method: 'POST', headers: H, body: '{}' }).then(j)
