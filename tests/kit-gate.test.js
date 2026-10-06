import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-kit-gate-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
const projects = await import('../server/projects.js')
const kitting = await import('../server/kitting.js')
const workflow = await import('../server/workflow.js')

const item = (name, done) => ({ kind: 'kabel', name, qty: 1, kitted: done, checked: done, stockUpdated: done })

describe('the E2E gate reads the Rüsten tab (roadmap 170, 171)', () => {
  const plan = projects.create({ name: 'Remote Coach rüsten', machine: 'Remote Coach', kind: 'e2e', owner: 'Roman Dosch', deadline: '2026-12-18' })
  const key = `plan:${plan.id}`
  it('finds the kitting module by itself and knows nothing while there is no kit', async () => {
    await workflow.loadKitting()
    expect(workflow.kitComplete(plan)).toBeNull()
  })
  it('an incomplete kit holds the gate, a complete one opens it', () => {
    kitting.save(key, { machines: [{ number: '000 030', bundle: 2, items: [item('USB-C cable 2 m', true), item('CAT6 cable 3 m', false)] }] })
    expect(workflow.kitComplete(plan)).toBe(false)
    kitting.save(key, { machines: [{ number: '000 030', bundle: 2, items: [item('USB-C cable 2 m', true), item('CAT6 cable 3 m', true)] }] })
    expect(workflow.kitComplete(plan)).toBe(true)
  })
  it('the plan page state carries what the kit says', () => {
    const s = workflow.state(plan.id)
    expect(JSON.stringify(s)).toMatch(/true/)
    expect(s).toBeTruthy()
  })
})
