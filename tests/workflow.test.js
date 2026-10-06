import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Scratch folders before any server module loads: a static import would write into the repo's ./data.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-workflow-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
const R = await import('../server/workflow-rules.js')
const W = await import('../server/workflow.js')
const projects = await import('../server/projects.js')
const raidd = await import('../server/raidd.js')
const store = await import('../server/store.js')
const settings = await import('../server/settings.js')
const report = await import('../server/report.js')
const alerts = await import('../server/alerts.js')
const policy = await import('../server/notify-policy.js')
const express = (await import('express')).default

const TODAY = '2026-10-06'   // a Tuesday

beforeAll(async () => {
  settings.update({ name: 'Noël Jensen', holidayRegion: 'none', daysOff: '' })
  await W.loadKitting()
  W.setKitProvider(null)   // the checkbox, whatever a kitting module would say
})

describe('kinds and validation', () => {
  it('cleans the workflow fields: an unknown kind is a plan, a Paket gets Roman as owner, a bad mail is dropped', () => {
    expect(R.cleanWorkflow({}, { kind: 'banana' })).toMatchObject({ kind: 'plan', owner: '', step: null })
    const p = R.cleanWorkflow({}, { kind: 'paket', ownerMail: 'not a mail', result: '  - Wiring diagram  \r\n\r\n* Parts list\n- Wiring diagram ' })
    expect(p).toMatchObject({ kind: 'paket', owner: 'Roman Dosch', ownerMail: '', step: 'eingang', presentNeeded: true, doneAt: null })
    expect(R.resultLines(p.result)).toEqual(['Wiring diagram', 'Parts list'])
    expect(R.cleanWorkflow({}, { kind: 'e2e', owner: '  Anna   Meier ', ownerMail: 'roman.dosch@tom.fit' })).toMatchObject({ owner: 'Anna Meier', ownerMail: 'roman.dosch@tom.fit', step: 'klaeren' })
    expect(R.cleanWorkflow({}, { kind: 'paket', result: 'x'.repeat(5000) }).result).toHaveLength(R.MAX.result)
    expect(R.cleanWorkflow({}, { kind: 'e2e', presentNeeded: 'false' }).presentNeeded).toBe(false)
  })
  it('never moves a step, a gate or doneAt from an untrusted input', () => {
    const base = R.cleanWorkflow({}, { kind: 'paket' })
    const p = R.cleanWorkflow(base, { step: 'gemeldet', doneAt: TODAY, intake: { result: { by: 'me', at: TODAY } }, escalated: { room: TODAY } })
    expect(p).toMatchObject({ step: 'eingang', doneAt: null, intake: { result: null, date: null }, escalated: {} })
    const t = R.cleanWorkflow(base, { step: 'liefern', intake: { result: { by: 'Roman', at: TODAY }, date: { at: 'nope' } } }, { trusted: true })
    expect(t).toMatchObject({ step: 'liefern', intake: { result: { by: 'Roman', at: TODAY }, date: null } })
    expect(R.cleanWorkflow(base, { step: 'bauen' }, { trusted: true }).step).toBe('eingang')   // not a Paket step
  })
  it('creates and updates through projects.js; old plans read as kind plan and stay as they were', () => {
    const plain = projects.create({ name: 'Leg press 7', deadline: '2026-12-01' })
    expect(plain).toMatchObject({ kind: 'plan', step: null })
    const paket = projects.create({ name: 'Remote Coach wiring', kind: 'paket', result: 'Wiring diagram\nParts list', deadline: '2026-11-20' })
    expect(paket).toMatchObject({ kind: 'paket', owner: 'Roman Dosch', step: 'klaeren' })   // the form was the intake
    expect(projects.create({ name: 'Paket without a date', kind: 'paket', result: 'One thing' }).step).toBe('eingang')
    expect(projects.update(paket.id, { step: 'gemeldet', doneAt: TODAY }).step).toBe('klaeren')
    expect(projects.update(paket.id, { kind: 'e2e' })).toMatchObject({ kind: 'e2e', step: 'klaeren' })
    projects.update(paket.id, { kind: 'paket' })
    expect(R.kindOf({ name: 'Remote Coach rüsten', machine: 'Remote Coach' })).toBe('plan')   // as stored before roadmap 170
    expect(projects.summaries().find(s => s.id === paket.id)).toMatchObject({ kind: 'paket', step: 'klaeren', owner: 'Roman Dosch' })
  })
})

describe('flow steps and gates', () => {
  it('walks the E2E steps, skips Präsentieren when not needed, and leaves Fertig to Report done', () => {
    const p = { kind: 'e2e', step: 'dokumentieren', presentNeeded: true }
    expect(R.stepsOf(p).map(s => s.name)).toEqual(['Klären', 'Rüsten', 'Bauen', 'Prüfen', 'Dokumentieren', 'Präsentieren', 'Übergeben', 'Fertig'])
    expect(R.nextOf(p).key).toBe('praesentieren')
    expect(R.nextOf({ ...p, presentNeeded: false }).key).toBe('uebergeben')
    expect(R.prevOf({ ...p, step: 'uebergeben', presentNeeded: false }).key).toBe('dokumentieren')
    expect(R.nextOf({ ...p, step: 'uebergeben' })).toBeNull()
    expect(R.stepsOf({ kind: 'paket' }).map(s => s.name)).toEqual(['Eingang', 'Klären', 'Liefern', 'Fertig gemeldet'])
    expect(R.nextOf({ kind: 'paket', step: 'liefern' })).toBeNull()
    expect(R.stepsOf({ kind: 'plan' })).toEqual([])
  })
  it('holds a Paket in Eingang and Klären until result and date are confirmed, with who and when', async () => {
    const p = projects.create({ name: 'Gate Paket', kind: 'paket', result: 'Layout drawing', deadline: '2026-11-30' })
    await expect(W.next(p.id, {}, TODAY)).rejects.toMatchObject({ status: 409, message: 'Not yet: Result clear and Date clear first.' })
    let s = await W.tick(p.id, { item: 'intake.result', on: true }, TODAY)
    expect(s.intake.result).toEqual({ by: 'Roman Dosch', at: TODAY })
    expect(s.missing.map(m => m.key)).toEqual(['date'])
    s = await W.tick(p.id, { item: 'intake.date', on: true, by: 'Roman, in the stand-up' }, TODAY)
    expect(s.intake.date).toEqual({ by: 'Roman, in the stand-up', at: TODAY })
    await expect(W.next(p.id, { to: 'gemeldet' }, TODAY)).rejects.toMatchObject({ status: 409 })
    s = await W.next(p.id, { to: 'liefern' }, TODAY)
    expect(s).toMatchObject({ step: 'liefern', next: null, intakeStep: false })
    await expect(W.next(p.id, {}, TODAY)).rejects.toMatchObject({ status: 409 })   // Fertig gemeldet only through Report done
    s = await W.back(p.id, TODAY)
    expect(s.step).toBe('klaeren')
  })
  it('refuses Result clear without a result and Date clear without a date', async () => {
    const p = projects.create({ name: 'Empty Paket', kind: 'paket' })
    await expect(W.tick(p.id, { item: 'intake.result', on: true }, TODAY)).rejects.toMatchObject({ status: 400 })
    await expect(W.tick(p.id, { item: 'intake.date', on: true }, TODAY)).rejects.toMatchObject({ status: 400 })
    const plain = projects.create({ name: 'Plain' })
    await expect(W.next(plain.id, {}, TODAY)).rejects.toMatchObject({ status: 400 })
    expect(W.state(plain.id, TODAY)).toEqual({ id: plain.id, kind: 'plan' })
  })
  it('holds an E2E in Rüsten until the kit is complete: the kitting list when it knows, else the checkbox', async () => {
    const p = projects.create({ name: 'Remote Coach build', kind: 'e2e', result: 'Runs the coach program', deadline: '2026-12-10' })
    await W.tick(p.id, { item: 'intake.result', on: true }, TODAY)
    await W.tick(p.id, { item: 'intake.date', on: true }, TODAY)
    expect((await W.next(p.id, {}, TODAY)).step).toBe('ruesten')
    await expect(W.next(p.id, {}, TODAY)).rejects.toMatchObject({ message: 'Not yet: Rüsten complete first.' })
    let s = await W.tick(p.id, { item: 'kit', on: true }, TODAY)
    expect(s.kit).toMatchObject({ known: false, complete: true, ticked: { by: 'Noël Jensen', at: TODAY } })
    // a kitting list that says not complete wins over the ticked box
    W.setKitProvider(plan => plan.id === p.id ? false : null)
    expect(W.kitComplete(projects.list().find(x => x.id === p.id))).toBe(false)
    await expect(W.next(p.id, {}, TODAY)).rejects.toMatchObject({ status: 409 })
    W.setKitProvider(() => true)
    await W.tick(p.id, { item: 'kit', on: false }, TODAY)
    s = await W.next(p.id, {}, TODAY)
    expect(s.step).toBe('bauen')
    W.setKitProvider(() => { throw new Error('broken') })
    expect(W.kitComplete({})).toBeNull()
    W.setKitProvider(() => 'maybe')
    expect(W.kitComplete({})).toBeNull()
    W.setKitProvider(null)
  })
})

describe('the scope guard', () => {
  let app, server, base
  beforeAll(async () => {
    app = express(); app.use(express.json())
    projects.registerRoutes(app); W.registerRoutes(app)
    server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r))
    base = `http://127.0.0.1:${server.address().port}`
  })
  afterAll(() => server?.close())
  const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  it('refuses a new task through Assign, adds it when agreed with a decision, logs a question when not', async () => {
    const p = projects.create({ name: 'Scope Paket', machine: 'Scope rig', kind: 'paket', result: 'Frame', deadline: '2026-11-30' })
    const a = store.createTask({ title: 'Extra sensor bracket', project: 'Other machine' })
    const b = store.createTask({ title: 'Cable <tray>', project: '' })
    const own = store.createTask({ title: 'Frame welding', project: 'Scope rig' })
    const refused = await post(`/api/projects/${p.id}/assign`, { taskId: a.id })
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ scope: true })
    expect((await post(`/api/projects/${p.id}/assign`, { taskId: own.id, phase: p.phases[0].id })).status).toBe(200)   // already on it: just a phase

    const yes = await (await post(`/api/workflow/${p.id}/scope`, { taskId: a.id, agreed: true })).json()
    expect(yes.added).toBe(true)
    expect(store.allTasks().find(t => t.id === a.id).project).toBe('Scope rig')
    expect(yes.entry).toMatchObject({ type: 'decision', title: 'Scope: Extra sensor bracket added, agreed with Roman Dosch', decidedBy: 'Roman Dosch', project: `plan:${p.id}` })

    const no = await (await post(`/api/workflow/${p.id}/scope`, { taskId: b.id, agreed: false })).json()
    expect(no.added).toBe(false)
    expect(store.allTasks().find(t => t.id === b.id).project).toBeFalsy()
    expect(no.entry).toMatchObject({ type: 'issue', title: 'Scope question: Cable <tray>', status: 'open', owner: 'Roman Dosch' })
    expect(raidd.stored(`plan:${p.id}`).map(e => e.type).sort()).toEqual(['decision', 'issue'])
    expect((await post(`/api/workflow/${p.id}/scope`, { taskId: b.id })).status).toBe(400)   // no answer, no change
  })
  it('only a Paket has the guard, and a plain plan assigns as before', async () => {
    const e2e = projects.create({ name: 'No guard', kind: 'e2e' })
    const t = store.createTask({ title: 'Anything' })
    expect((await post(`/api/workflow/${e2e.id}/scope`, { taskId: t.id, agreed: true })).status).toBe(400)
    const plain = projects.create({ name: 'Plain assign', machine: 'Plain rig' })
    expect((await post(`/api/projects/${plain.id}/assign`, { taskId: t.id })).status).toBe(200)
    expect(store.allTasks().find(x => x.id === t.id).project).toBe('Plain rig')
  })
  it('asks the question in plain words', () => {
    expect(R.scopeQuestion('Roman Dosch')).toBe("This widens Roman's Paket. Agreed with him?")
    expect(R.scopeQuestion('Anna Meier')).toBe("This widens Anna's Paket. Agreed with Anna?")
  })
})

describe('early escalation', () => {
  const paket = { kind: 'paket', name: 'P', owner: 'Roman Dosch', step: 'liefern', deadline: '2026-10-20', escalated: {} }
  const keys = rs => rs.map(r => r.key)
  it('escalates when the room drops below one working day, and says how far behind', () => {
    expect(keys(R.escalation(paket, { today: TODAY, slack: 3 }))).toEqual([])
    expect(keys(R.escalation(paket, { today: TODAY, slack: null }))).toEqual([])
    const zero = R.escalation(paket, { today: TODAY, slack: 0 })
    expect(zero).toEqual([expect.objectContaining({ key: 'room', text: 'less than a working day of room before Tue 20 Oct' })])
    expect(R.escalation(paket, { today: TODAY, slack: -2 })[0]).toMatchObject({ key: 'room', text: '2 working days behind the date', de: expect.stringContaining('2 Arbeitstage') })
  })
  it('escalates on the deadline day when the step is not Fertig, and never once it is done or a plain plan', () => {
    const due = { ...paket, deadline: TODAY }
    expect(keys(R.escalation(due, { today: TODAY, slack: 0 }))).toEqual(['deadline'])
    expect(keys(R.escalation(due, { today: TODAY, slack: -1 }))).toEqual(['deadline', 'room'])
    expect(R.escalation({ ...due, step: 'gemeldet' }, { today: TODAY, slack: -1 })).toEqual([])
    expect(R.escalation({ ...due, kind: 'plan' }, { today: TODAY, slack: -1 })).toEqual([])
  })
  it('escalates an open issue or a dependency at risk older than one working day', () => {
    const q = [
      { id: 'i1', type: 'issue', status: 'open', title: 'Supplier silent', createdAt: '2026-10-02T09:00:00Z' },   // Fri: 2 working days
      { id: 'i2', type: 'issue', status: 'in progress', title: 'Fresh', createdAt: '2026-10-05T09:00:00Z' },        // Mon: 1, not older
      { id: 'i3', type: 'issue', status: 'resolved', title: 'Closed', createdAt: '2026-09-01T09:00:00Z' },
      { id: 'd1', type: 'dependency', status: 'at risk', title: 'Frame from the workshop', createdAt: '2026-09-01T09:00:00Z', updatedAt: '2026-10-01T09:00:00Z' },
      { id: 'd2', type: 'dependency', status: 'at risk', title: 'Just flagged', updatedAt: '2026-10-05T15:00:00Z' },
      { id: 'd3', type: 'dependency', status: 'open', title: 'Need-by passed', needBy: '2026-10-01' },
      { id: 'd4', type: 'dependency', status: 'open', title: 'Fine', needBy: '2026-10-30' },
      { id: 'd5', type: 'dependency', status: 'met', title: 'Met', needBy: '2026-09-01' }
    ]
    const r = R.escalation(paket, { today: TODAY, slack: 5, raiddSummary: { dependenciesAtRisk: ['d1', 'd2', 'd3'] }, openQuestions: q })
    expect(keys(r)).toEqual(['issue:i1', 'dep:d1', 'dep:d3'])
    expect(r[0]).toMatchObject({ text: 'issue open since Fri 2 Oct: Supplier silent', de: 'Offenes Problem seit 2.10.2026: Supplier silent' })
  })
  it('escalates an assumption past its validate-by date that is not validated', () => {
    const q = [
      { id: 'a1', type: 'assumption', status: 'open', title: 'Customer accepts 230 V', validateBy: '2026-10-05', validated: null },
      { id: 'a2', type: 'assumption', status: 'open', title: 'Not yet due', validateBy: '2026-10-09' },
      { id: 'a3', type: 'assumption', status: 'validated', title: 'Done', validateBy: '2026-09-01', validated: true }
    ]
    expect(keys(R.escalation(paket, { today: TODAY, slack: 5, raiddSummary: { assumptionsDue: ['a1'] }, openQuestions: q }))).toEqual(['assumption:a1'])
  })
  it('quiets a reason escalated today or on the working day before, and brings it back after', () => {
    const p = { ...paket, escalated: { room: '2026-10-05' } }
    expect(R.escalation(p, { today: TODAY, slack: 0 })).toEqual([])
    expect(keys(R.escalation(p, { today: '2026-10-07', slack: 0 }))).toEqual(['room'])
    expect(R.escalation({ ...paket, escalated: { room: '2026-10-02' } }, { today: '2026-10-05', slack: 0 })).toEqual([])   // Fri to Mon is one working day
    expect(R.weekdayAge('2026-10-02', '2026-10-05')).toBe(1)
    expect(R.weekdayAge('2026-10-05', '2026-10-07')).toBe(2)
  })
  it('reads the plan, its room and its RAIDD log on the server; Escalated logs a decision and quiets it', async () => {
    const p = projects.create({ name: 'Due today', kind: 'paket', result: 'Report', deadline: TODAY })
    raidd.create({ project: `plan:${p.id}`, type: 'assumption', title: 'Rack fits', validateBy: '2026-10-01' })
    let s = W.state(p.id, TODAY)
    expect(keys(s.escalation)).toEqual(expect.arrayContaining(['deadline']))
    expect(s.escalation.some(r => r.key.startsWith('assumption:'))).toBe(true)
    expect(s.mail.escalate).toMatch(/^mailto:\?subject=Due%20today%3A%20fr%C3%BCh%20eskaliert&body=Hallo%20Roman/)
    expect(W.escalations(TODAY).map(e => e.id)).toContain(p.id)
    const r = await W.escalated(p.id, TODAY)
    expect(r.entry).toMatchObject({ type: 'decision', decidedOn: TODAY, decidedBy: 'Noël Jensen', title: expect.stringMatching(/^Escalated to Roman Dosch: the deadline is today/) })
    expect(r.state.escalation).toEqual([])
    expect(W.escalations(TODAY).map(e => e.id)).not.toContain(p.id)
    await expect(W.escalated(p.id, TODAY)).rejects.toMatchObject({ status: 409 })
  })
  it('notifies once a day per plan in its own category', () => {
    const m = alerts.escalateMessage({ id: 'abc', name: 'Remote Coach wiring', owner: 'Roman Dosch', reasons: [{ text: 'the deadline is today and it is not done' }] })
    expect(m).toEqual({ title: 'Escalate to Roman now.', body: 'Remote Coach wiring: the deadline is today and it is not done.', route: '#/projects?p=abc', category: 'escalate', key: 'abc' })
    expect(policy.DEFAULT_MODES.escalate).toBe('desktop')
    expect(policy.decide({ category: 'escalate', key: 'abc', day: { keys: ['escalate:abc'] }, now: new Date(2026, 9, 6, 10) }).reason).toBe('duplicate')
  })
})

describe('done means done', () => {
  it('builds the E2E checklist from the definition of done and the Paket checklist from the result lines', () => {
    expect(R.checklist({ kind: 'e2e', dod: {} }).map(c => [c.label, c.needed])).toEqual([['It runs', true], ['Documented', true], ['Someone else could rebuild it or service it', true], ['Presented', true]])
    expect(R.checklist({ kind: 'e2e', dod: {}, presentNeeded: false }).at(-1).needed).toBe(false)
    expect(R.checklist({ kind: 'paket', result: '1. Diagram\n2) Parts list\n\n[x] Test report', resultDone: { Diagram: TODAY } }).map(c => [c.label, c.done]))
      .toEqual([['Diagram', true], ['Parts list', false], ['Test report', false]])
    expect(R.doneBlockers({ kind: 'paket', result: '', intake: { result: { at: TODAY }, date: { at: TODAY } } })).toEqual(['an agreed result to tick'])
  })
  it('keeps Report done locked until every box is ticked, then sets Fertig gemeldet and doneAt', async () => {
    const p = projects.create({ name: 'Done Paket', machine: 'Done rig', kind: 'paket', result: 'Diagram\nParts list', deadline: '2026-11-30' })
    const t = store.createTask({ title: 'Draw the diagram', project: 'Done rig' }); store.updateTask(t.id, { done: true })
    await expect(W.done(p.id, TODAY)).rejects.toMatchObject({ status: 409, message: 'Not done yet: Result clear, Date clear, Diagram and Parts list.' })
    await W.tick(p.id, { item: 'intake.result', on: true }, TODAY)
    await W.tick(p.id, { item: 'intake.date', on: true }, TODAY)
    await W.tick(p.id, { item: 'result:Diagram', on: true }, TODAY)
    let s = W.state(p.id, TODAY)
    expect(s).toMatchObject({ canReportDone: false, blockers: ['Parts list'] })
    await expect(W.tick(p.id, { item: 'result:Not a line', on: true }, TODAY)).rejects.toMatchObject({ status: 400 })
    await W.tick(p.id, { item: 'result:Parts list', on: true }, TODAY)
    s = await W.done(p.id, TODAY)
    expect(s).toMatchObject({ step: 'gemeldet', done: true, doneAt: TODAY, report: `/api/report/done/${p.id}` })
    expect(s.mail.done).toMatch(/subject=Done%20Paket%3A%20fertig/)
    expect(decodeURIComponent(s.mail.done)).toContain('- Draw the diagram')
    await expect(W.tick(p.id, { item: 'result:Diagram', on: false }, TODAY)).rejects.toMatchObject({ status: 400 })
    // a changed line has to be ticked again
    expect(R.cleanWorkflow({ ...projects.list().find(x => x.id === p.id) }, { result: 'Diagram, revised\nParts list' }).resultDone).toEqual({ 'Parts list': TODAY })
    s = await W.back(p.id, TODAY)
    expect(s).toMatchObject({ step: 'liefern', done: false, doneAt: null })
  })
  it('asks the E2E for It runs, Documented, Rebuild and Presented unless no presentation is needed', async () => {
    const p = projects.create({ name: 'E2E done', kind: 'e2e', result: 'Runs', deadline: '2026-12-01' })
    await W.tick(p.id, { item: 'intake.result', on: true }, TODAY)
    await W.tick(p.id, { item: 'intake.date', on: true }, TODAY)
    await W.tick(p.id, { item: 'kit', on: true }, TODAY)
    for (const k of ['runs', 'documented', 'rebuild']) await W.tick(p.id, { item: `dod.${k}`, on: true }, TODAY)
    expect(W.state(p.id, TODAY).blockers).toEqual(['Presented'])
    projects.update(p.id, { presentNeeded: false })
    const s = await W.done(p.id, TODAY)
    expect(s).toMatchObject({ step: 'fertig', doneAt: TODAY })
  })
})

describe('the done report', () => {
  it('escapes everything that came from a person, and says what is still open', () => {
    const p = R.cleanWorkflow({}, { kind: 'paket', owner: 'Roman <b>Dosch</b>', result: 'Diagram <img src=x onerror=alert(1)>\nParts "list"' })
    const d = {
      project: { id: 'x', name: 'Paket <script>alert(1)</script>', goal: 'Goal & more', deadline: '2026-11-30', ...p, step: 'gemeldet', doneAt: TODAY, resultDone: { 'Diagram <img src=x onerror=alert(1)>': TODAY } },
      phases: [{ id: 'ph', name: 'Build <1>', tasks: [{ id: 't1', title: 'Wire <the> rack', done: true, completedAt: '2026-10-05T10:00:00Z' }, { id: 't2', title: 'Open one', done: false }] }],
      unassigned: []
    }
    const html = report.doneReport(d, { today: TODAY, author: 'Noël <Jensen>', open: [{ type: 'issue', title: 'Scope question: <x>', owner: 'Roman', status: 'open' }], raciHtml: '' })
    expect(html).not.toMatch(/<script>alert|<img src=x|<b>Dosch|<the>|<x>|<Jensen>/)
    expect(html).toContain('Paket &lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('Diagram &lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('Parts &quot;list&quot;')
    expect(html).toContain('Wire &lt;the&gt; rack')
    expect(html).not.toContain('Open one')
    expect(html).toContain('Scope question: &lt;x&gt;')
    expect(html).toContain('ticked 6 Oct 2026')
    expect(html).toContain('not ticked')
    expect(html).toContain('Paket, done')
    expect(html).toContain('Paket from Roman &lt;b&gt;Dosch&lt;/b&gt;')
  })
  it('says None when nothing is open', () => {
    const d = { project: { id: 'y', name: 'E2E', ...R.cleanWorkflow({}, { kind: 'e2e' }), step: 'fertig', doneAt: TODAY }, phases: [], unassigned: [] }
    const html = report.doneReport(d, { today: TODAY })
    expect(html).toContain('None. Everything in the log is closed.')
    expect(html).toContain('Definition of done')
    expect(html).toContain('E2E, done')
  })
})

describe('the mail drafts', () => {
  it('asks for what is unclear in short German, to the owner when the mail is known', () => {
    const p = { name: 'Remote Coach', owner: 'Roman Dosch', ownerMail: 'roman.dosch@tom.fit', result: 'Diagram', deadline: null, intake: { result: { by: 'Roman', at: TODAY }, date: null } }
    const m = R.intakeMail(p, { me: 'Noël Jensen' })
    expect(m.startsWith('mailto:roman.dosch@tom.fit?subject=Remote%20Coach%3A%20Resultat%20und%20Termin%20kl%C3%A4ren&body=')).toBe(true)
    const body = decodeURIComponent(m.split('&body=')[1])
    expect(body).toContain('Hallo Roman')
    expect(body).toContain('- Termin: Bis wann brauchst du es?')
    expect(body).not.toContain('Resultat: Was')
    expect(body.endsWith('Gruss\r\nNoël')).toBe(true)
    expect(body.includes(String.fromCharCode(0x2014))).toBe(false)   // no em dash
  })
})
