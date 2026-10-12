import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Scratch folders before any server module loads: a static import would write into the repo's ./data.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-jobs-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
const R = await import('../server/workflow-rules.js')
const { jobs, nextFor, byUrgency } = await import('../server/jobs.js')
const settings = await import('../server/settings.js')
const express = (await import('express')).default

const TODAY = '2026-10-12'   // a Monday
const stamp = { by: 'Roman Dosch', at: '2026-10-06' }
const plan = (id, input, extra = {}) => ({ id, name: input.name || id, machine: input.machine || input.name || id, deadline: input.deadline || null, deadlineLabel: 'FAT', phases: input.phases || [], archived: false, ...R.cleanWorkflow({}, input, { trusted: true }), ...extra })
const item = (name, done = false, kind = 'doku') => ({ id: `i-${name.replace(/\W/g, '')}`, kind, name, kitted: done, checked: done, stockUpdated: done })
const machine = (number, bundle, items, extra = {}) => ({ id: `m-${number}`, number, bundle, items, ...extra })

beforeAll(() => { settings.update({ holidayRegion: 'none', daysOff: '' }) })

describe('which plans are jobs', () => {
  const plans = [
    plan('p-open', { name: 'Wiring diagram', kind: 'paket', step: 'liefern', deadline: '2026-10-20', result: 'Diagram', intake: { result: stamp, date: stamp } }),
    plan('p-done', { name: 'Old Paket', kind: 'paket', step: 'gemeldet', deadline: '2026-10-01', result: 'X', doneAt: '2026-10-01' }),
    plan('p-archived', { name: 'Archived', kind: 'e2e', step: 'bauen', deadline: '2026-10-13' }, { archived: true }),
    plan('plain-near', { name: 'Leg press 7', deadline: '2026-10-22' }),
    plan('plain-far', { name: 'Leg press 8', deadline: '2026-11-30' }),
    plan('plain-past-open', { name: 'Rig 3', deadline: '2026-10-02' }),
    plan('plain-past-closed', { name: 'Rig 4', deadline: '2026-10-02' })
  ]
  const tasks = [{ id: 't1', title: 'Wire the rig', project: 'Rig 3', done: false }, { id: 't2', title: 'Old', project: 'Rig 4', done: true }]
  const list = jobs({ plans, tasks, today: TODAY })
  it('takes open Pakete and E2E, and plain plans only near their date or past it with work open', () => {
    expect(list.map(j => j.id).sort()).toEqual(['p-open', 'plain-near', 'plain-past-open'])
  })
  it('counts the working days left and the open tasks', () => {
    const near = list.find(j => j.id === 'plain-near')
    expect(near.daysLeft).toBe(8)
    expect(near.next).toBe('FAT in 8 working days, nothing open.')
    const past = list.find(j => j.id === 'plain-past-open')
    expect(past.openTasks).toBe(1)
    expect(past.late).toBe(true)
    expect(past.next).toBe('FAT 6 working days ago, 1 task open.')
  })
})

describe('one job', () => {
  it('a Paket due today escalates, with the questions and the result lines counted', () => {
    const p = plan('rc', { name: 'Remote Coach', kind: 'paket', owner: 'Roman Dosch', step: 'liefern', deadline: TODAY, result: 'Wiring diagram\nParts list\nTest report', resultDone: { 'Wiring diagram': '2026-10-09' }, intake: { result: stamp, date: stamp } })
    const raidd = { 'plan:rc': [
      { id: 'q1', project: 'plan:rc', type: 'issue', status: 'open', title: 'Which connector?', createdAt: '2026-10-12T08:00:00Z' },
      { id: 'q2', project: 'plan:rc', type: 'decision', status: 'made', title: 'Use the 24 V relay' },
      { id: 'q3', project: 'plan:rc', type: 'issue', status: 'resolved', title: 'Closed one', createdAt: '2026-10-01T08:00:00Z' }
    ] }
    const [j] = jobs({ plans: [p], raidd, today: TODAY })
    expect(j).toMatchObject({ id: 'rc', kind: 'paket', kindLabel: 'Paket', owner: 'Roman Dosch', step: 'liefern', stepName: 'Liefern', index: 2, daysLeft: 0, dueToday: true, escalating: true })
    expect(j.steps.map(s => s.name)).toEqual(['Eingang', 'Klären', 'Liefern', 'Fertig gemeldet'])
    expect(j.questions).toMatchObject({ open: 1, oldest: '2026-10-12', age: 0 })
    expect(j.done).toEqual({ ticked: 1, total: 3 })
    expect(j.gate.holds).toBe(false)
    expect(j.escalation[0].key).toBe('deadline')
    expect(j.next).toBe('Escalate: due today, 2 items open.')
    expect(j.href).toBe('#/projects?p=rc')
  })
  it('a Paket in the intake asks the owner what is not clear', () => {
    const p = plan('in', { name: 'Brake test', kind: 'paket', owner: 'Roman Dosch', step: 'eingang', deadline: '2026-10-20', result: 'Brake test rig', intake: { result: stamp } })
    const [j] = jobs({ plans: [p], today: TODAY })
    expect(j.gate).toEqual({ holds: true, why: [{ key: 'date', text: 'Date clear' }] })
    expect(j.next).toBe('Ask Roman: date not clear.')
    const both = jobs({ plans: [plan('in2', { name: 'X', kind: 'paket', step: 'klaeren', deadline: '2026-10-20' })], today: TODAY })[0]
    expect(both.next).toBe('Ask Roman: result and date not clear.')
    const clear = jobs({ plans: [plan('in3', { name: 'Y', kind: 'paket', step: 'klaeren', deadline: '2026-10-20', result: 'A', intake: { result: stamp, date: stamp } })], today: TODAY })[0]
    expect(clear.next).toBe('Intake clear. Move on to Liefern.')
  })
  it('an E2E on Rüsten counts the kit and opens the Rüsten tab', () => {
    const p = plan('e1', { name: 'Remote Coach', kind: 'e2e', step: 'ruesten', deadline: '2026-10-16', intake: { result: stamp, date: stamp } })
    const kitting = { 'plan:e1': { machines: [
      machine('000 030', 3, [item('Schema', true), item('Kabel X1', false, 'kabel'), item('Doku', false)]),
      machine('000 031', 6, [item('Schema', true), item('Doku', true)]),
      machine('000 032', 6, [item('Schema', false)])
    ] } }
    const [j] = jobs({ plans: [p], kitting, today: TODAY })
    expect(j.kit).toMatchObject({ kitted: 3, total: 6, open: 3, machines: 3, complete: 1 })
    expect(j.gate).toEqual({ holds: true, why: [{ key: 'kit', text: 'Rüsten complete' }] })
    expect(j.next).toBe('Rüsten: 3 items open on 2 machines.')
    expect(j.tab).toBe('kit')
    expect(j.href).toBe('#/projects?p=e1&t=kit')
    const empty = jobs({ plans: [p], today: TODAY })[0]
    expect(empty.kit).toBeNull()
    expect(empty.next).toBe('Rüsten: put the machines and their items on the Rüsten tab.')
  })
  it('Präsentieren asks for the missing bundle, Übergeben for the handover', () => {
    const doc = { machines: [machine('000 030', 3, [item('Schema', true)], { presentedOn: '2026-10-09' }), machine('000 031', 6, [item('Schema', true)])] }
    const pres = jobs({ plans: [plan('e2', { name: 'Bundle run', kind: 'e2e', step: 'praesentieren', deadline: '2026-10-30', intake: { result: stamp, date: stamp } })], kitting: { 'plan:e2': doc }, today: TODAY })[0]
    expect(pres.next).toBe('Present one machine from Bundle 6.')
    expect(pres.tab).toBe('kit')
    const hand = jobs({ plans: [plan('e3', { name: 'Hand it', kind: 'e2e', step: 'uebergeben', deadline: '2026-10-30', intake: { result: stamp, date: stamp } })], kitting: { 'plan:e3': { machines: [...doc.machines] } }, today: TODAY })[0]
    expect(hand.next).toBe('Hand 2 machines over to Service.')
  })
  it('every box ticked: report done to the owner', () => {
    const p = plan('ok', { name: 'Parts list', kind: 'paket', owner: 'Roman Dosch', step: 'liefern', deadline: '2026-10-20', result: 'Parts list', resultDone: { 'Parts list': '2026-10-10' }, intake: { result: stamp, date: stamp } })
    expect(jobs({ plans: [p], today: TODAY })[0].next).toBe('Report done to Roman.')
  })
  it('a question open for a working day goes to the owner, on the RAIDD tab', () => {
    const p = plan('q', { name: 'Cable tray', kind: 'paket', owner: 'Roman Dosch', step: 'liefern', deadline: '2026-10-28', result: 'Tray\nCover', intake: { result: stamp, date: stamp } })
    const raidd = [{ id: 'a1', project: 'plan:q', type: 'assumption', status: 'open', title: 'Cover in steel', createdAt: '2026-10-09T09:00:00Z' }]
    const [j] = jobs({ plans: [p], raidd, today: TODAY })
    expect(j.questions.age).toBe(1)
    expect(j.next).toBe('Ask Roman: 1 question open for 1 working day.')
    expect(j.tab).toBe('raidd')
    const older = jobs({ plans: [p], raidd: [{ ...raidd[0], type: 'issue', createdAt: '2026-10-06T09:00:00Z' }], today: TODAY })[0]
    expect(older.escalating).toBe(true)
    expect(older.next).toBe('Escalate: a question has waited too long, 2 items open.')
  })
  it('nextFor works on a job alone', () => {
    expect(nextFor({ kind: 'plan', deadlineLabel: 'Delivery', daysLeft: 0, openTasks: 3 }).text).toBe('Delivery today, 3 tasks open.')
    expect(nextFor({ kind: 'e2e', owner: 'Anna Meier', canReportDone: false, escalating: false, gate: { holds: false, why: [] }, questions: { open: 0 }, step: 'bauen', openTasks: 2, left: 3 }).text).toBe('Bauen: 2 tasks open. Ask early when something is unclear.')
  })
})

describe('the order', () => {
  it('escalations first, then the deadline, then E2E before Paket on the same day', () => {
    const plans = [
      plan('late-plan', { name: 'Plain', deadline: '2026-10-14' }),
      plan('paket-14', { name: 'Paket 14', kind: 'paket', step: 'liefern', deadline: '2026-10-14', result: 'A', intake: { result: stamp, date: stamp } }),
      plan('e2e-14', { name: 'E2E 14', kind: 'e2e', step: 'bauen', deadline: '2026-10-14', intake: { result: stamp, date: stamp } }),
      plan('paket-nodate', { name: 'No date', kind: 'paket', step: 'eingang' }),
      plan('e2e-30', { name: 'E2E 30', kind: 'e2e', step: 'bauen', deadline: '2026-10-30', intake: { result: stamp, date: stamp } }, { slack: -2 })
    ]
    const list = jobs({ plans, tasks: [{ id: 't', title: 'x', project: 'Plain' }], today: TODAY })
    expect(list.map(j => j.id)).toEqual(['e2e-30', 'e2e-14', 'paket-14', 'late-plan', 'paket-nodate'])
    expect(list[0].next).toBe('Escalate: 2 working days behind, 4 items open.')   // the four boxes of done
    expect([...list].sort(byUrgency).map(j => j.id)).toEqual(list.map(j => j.id))
  })
})

describe('GET /api/jobs', () => {
  it('answers with today and the jobs from what is stored', async () => {
    const projects = await import('../server/projects.js')
    const { registerRoutes } = await import('../server/jobs.js')
    const p = projects.create({ name: 'Stored Paket', kind: 'paket', owner: 'Roman Dosch', deadline: '2026-12-01', result: 'One thing' })
    const app = express(); registerRoutes(app)
    const server = app.listen(0)
    try {
      const r = await fetch(`http://127.0.0.1:${server.address().port}/api/jobs`).then(x => x.json())
      expect(r.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const j = r.jobs.find(x => x.id === p.id)
      expect(j).toMatchObject({ kind: 'paket', step: 'klaeren', owner: 'Roman Dosch' })
      expect(j.next).toBe('Ask Roman: result and date not clear.')
    } finally { server.close() }
  })
})
