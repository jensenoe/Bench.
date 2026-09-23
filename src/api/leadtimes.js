/** Lead times (roadmap 70): what a supplier usually takes, and the order-by date that follows from it. */
import { j } from './http.js'
/** { orderBy, days, basis: 'history' | 'default', samples } for a supplier and the day the part must be there. */
export const suggestOrderBy = (supplier, needBy) => fetch(`/api/leadtimes/suggest?supplier=${encodeURIComponent(supplier)}&needBy=${encodeURIComponent(needBy)}`).then(j)
/** Every supplier the board has seen, with its measured lead time. */
export const getLeadtimes = () => fetch('/api/leadtimes').then(j)
