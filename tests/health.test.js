import { describe, it, expect, beforeAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-health-'))
process.env.BENCH_DATA_DIR = dir
process.env.BENCH_USER_DIR = dir
process.env.BENCH_LOG_FILE = path.join(dir, 'bench.log')
vi.mock('../server/auth.js', () => ({ getTokenSilent: async () => null, getAccount: async () => null, isConfigured: () => false }))
let health, store, settings

beforeAll(async () => {
  store = await import('../server/store.js')
  settings = await import('../server/settings.js')
  health = await import('../server/health.js')
})

describe('check', () => {
  it('runs every check and caches for a minute', async () => {
    store.createTask({ title: 'x' })
    const r = await health.check({ force: true })
    expect(r.checks.map(c => c.key)).toEqual(['data', 'store', 'm365', 'workbook', 'sources', 'backups', 'mirror'])
    for (const c of r.checks) { expect(typeof c.ok).toBe('boolean'); expect(c.label).toBeTruthy(); expect(typeof c.detail).toBe('string') }
    expect(r.checks.find(c => c.key === 'data')).toMatchObject({ ok: true, detail: dir })
    expect(r.checks.find(c => c.key === 'store').ok).toBe(true)
    expect(r.checks.find(c => c.key === 'm365')).toMatchObject({ ok: true })   // not configured is not a fault
    expect(r.checks.find(c => c.key === 'backups').ok).toBe(true)              // the first save made today's copy
    expect(r.ok).toBe(true)
    expect(fs.readdirSync(dir).some(f => f.startsWith('.bench-probe'))).toBe(false)   // probe file cleaned up
    const again = await health.check()
    expect(again.at).toBe(r.at)
  })
  it('flags a source with an error', async () => {
    store.noteSourceError('issues', 'HTTP 500 from the tool')
    const r = await health.check({ force: true })
    expect(r.checks.find(c => c.key === 'sources')).toMatchObject({ ok: false })
    expect(r.checks.find(c => c.key === 'sources').detail).toMatch(/issues: HTTP 500/)
    expect(r.ok).toBe(false)
  })
})

describe('diagnostics', () => {
  it('is plain text with paths, settings, checks and the log tail, and never the token', async () => {
    settings.update({ updateToken: 'ghp_verysecret', name: 'Noël Jensen', timesheetUrl: 'https://1drv.ms/x/secret-link' })
    fs.writeFileSync(process.env.BENCH_LOG_FILE, Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join('\n'))
    const text = await health.diagnostics()
    expect(text).toMatch(/^Bench \d/)
    expect(text).toContain(`data   ${dir}`)
    expect(text).toContain('Health:')
    expect(text).toContain('issues     error: HTTP 500')
    expect(text).not.toContain('ghp_verysecret')
    expect(text).not.toContain('secret-link')
    expect(text).toContain('updateToken      "(set)"')
    expect(text).toContain('line 80')
    expect(text).not.toContain('line 20\n')
  })
})
