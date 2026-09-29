/** The innovation portfolio (server/portfolio.js, roadmap 143): projects from the I-coded Planner cards. */
import { j } from './http.js'
/** { stages: [{ key, name, de }], projects: [{ code, name, stage, stageName, due, overdue, open, openActions, folder, ... }] } */
export const getPortfolio = () => fetch('/api/portfolio').then(j)
/** One project: { project, stages, tasks, entries, actions, maps, plan } */
export const getInnovation = (code) => fetch(`/api/portfolio/${encodeURIComponent(code)}`).then(j)
