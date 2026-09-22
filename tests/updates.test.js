import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.BENCH_USER_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-upd-'))
const { compare, check, RELEASES_URL } = await import('../server/updates.js')

describe('compare', () => {
  it('orders versions and prereleases', () => {
    expect(compare('0.9.0-beta.2', '0.9.0-beta.1')).toBe(1)
    expect(compare('0.9.0', '0.9.0-beta.9')).toBe(1)
    expect(compare('0.9.0-beta.1', '0.9.0')).toBe(-1)
    expect(compare('0.10.0', '0.9.1')).toBe(1)
    expect(compare('v1.0.0', '1.0.0')).toBe(0)
    expect(compare('0.9.0-rc.1', '0.9.0-beta.4')).toBe(1)
  })
})

describe('check', () => {
  const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body })
  it('reads the latest release and finds the installer', async () => {
    const r = await check({ force: true, fetchImpl: async () => res(200, { tag_name: 'v9.9.9', html_url: 'https://github.com/x/y/releases/tag/v9.9.9', assets: [{ name: 'Bench-portable-9.9.9.exe', browser_download_url: 'p' }, { name: 'Bench-Setup-9.9.9.exe', browser_download_url: 'https://dl/Bench-Setup-9.9.9.exe' }] }) })
    expect(r.newer).toBe(true)
    expect(r.latest).toBe('9.9.9')
    expect(r.download).toBe('https://dl/Bench-Setup-9.9.9.exe')
    expect(r.reason).toBeNull()
  })
  it('says private when anonymous gets 404, and offline when fetch throws', async () => {
    const p = await check({ force: true, fetchImpl: async () => res(404, {}) })
    expect(p.reason).toBe('private')
    expect(p.url).toBe(RELEASES_URL)
    const o = await check({ force: true, fetchImpl: async () => { throw new Error('ENOTFOUND') } })
    expect(o.reason).toBe('offline')
    expect(o.newer).toBe(false)
  })
  it('caches between calls', async () => {
    let calls = 0
    await check({ force: true, fetchImpl: async () => { calls++; return res(200, { tag_name: 'v0.0.1', assets: [] }) } })
    await check({ fetchImpl: async () => { calls++; return res(200, { tag_name: 'v0.0.2', assets: [] }) } })
    expect(calls).toBe(1)
  })
})
