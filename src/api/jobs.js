/** Jobs first (server/jobs.js, roadmap 175): every open Paket and E2E, and what to do now. */
import { j } from './http.js'
export const getJobs = () => fetch('/api/jobs').then(j)
