/**
 * The focus timer's store (roadmap 82). One timer at a time, module scope, persisted in localStorage
 * under `bench.focus` so a reload keeps it. `startedAt` is when the current running stretch began and
 * `remainingMs` what was left at that moment; while paused, `pausedAt` is set and `remainingMs` is exact.
 */
const KEY = 'bench.focus'
const storage = () => { try { return globalThis.localStorage || null } catch { return null } }

let state = load()
const subs = new Set()

function load() {
  try { const raw = storage()?.getItem(KEY); const s = raw ? JSON.parse(raw) : null; return s && s.taskId && s.minutes > 0 ? s : null } catch { return null }
}
function save() {
  try { const st = storage(); if (!st) return; state ? st.setItem(KEY, JSON.stringify(state)) : st.removeItem(KEY) } catch { /* private mode, full quota: the timer still runs */ }
}
function emit() { for (const fn of subs) fn(state) }

export const get = () => state
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn) }

export function start({ taskId, title, minutes = 25 }, now = Date.now()) {
  const m = Math.max(1, Number(minutes) || 25)
  state = { taskId, title: String(title || ''), minutes: m, startedAt: now, pausedAt: null, remainingMs: m * 60_000 }
  save(); emit()
  return state
}
export function pause(now = Date.now()) {
  if (!state || state.pausedAt) return state
  state = { ...state, remainingMs: remaining(state, now), pausedAt: now }
  save(); emit()
  return state
}
export function resume(now = Date.now()) {
  if (!state || !state.pausedAt) return state
  state = { ...state, startedAt: now, pausedAt: null }
  save(); emit()
  return state
}
export function stop() {
  const was = state
  state = null
  save(); emit()
  return was
}

/** Milliseconds left, never below zero. */
export function remaining(s = state, now = Date.now()) {
  if (!s) return 0
  if (s.pausedAt) return Math.max(0, s.remainingMs)
  return Math.max(0, s.remainingMs - (now - s.startedAt))
}
export const isRunning = (s = state) => Boolean(s && !s.pausedAt)
/** "24:59" */
export function mmss(ms) {
  const sec = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}
/** Hours to the nearest quarter: 0.4 becomes 0.5, 1.1 becomes 1, never below a quarter for a finished timer. */
export const quarterHours = (h) => Math.max(0.25, Math.round(h * 4) / 4)
/** The task's new effort after a finished timer of `minutes`. */
export const addEffort = (effortHours, minutes) => Math.round((Number(effortHours) || 0) * 4 + quarterHours(minutes / 60) * 4) / 4
