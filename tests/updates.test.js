import { describe, it, expect, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.BENCH_USER_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-upd-'))
const { compare, check, download, downloaded, start, stop, registerRoutes, DOWNLOAD_DIR, RELEASES_URL } = await import('../server/updates.js')

const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body })
const bytes = (status, buf) => ({ status, ok: status >= 200 && status < 300, body: null, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) })
const NAME = 'Bench-Setup-99.0.0-test.exe'
const FILE = path.join(DOWNLOAD_DIR, NAME)
const release = (size) => ({ tag_name: 'v99.0.0', html_url: 'https://github.com/x/y/releases/tag/v99.0.0', assets: [{ id: 4242, name: NAME, size, browser_download_url: `https://dl/${NAME}` }] })
const clean = () => { for (const f of [FILE, FILE + '.part', path.join(process.env.BENCH_USER_DIR, 'update.json')]) { try { fs.unlinkSync(f) } catch { /* not there */ } } }
afterAll(clean)

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
  it('reads the latest release and finds the installer', async () => {
    const r = await check({ force: true, fetchImpl: async () => res(200, { tag_name: 'v9.9.9', html_url: 'https://github.com/x/y/releases/tag/v9.9.9', assets: [{ id: 1, name: 'Bench-portable-9.9.9.exe', browser_download_url: 'p' }, { id: 2, name: 'Bench-Setup-9.9.9.exe', size: 10, browser_download_url: 'https://dl/Bench-Setup-9.9.9.exe' }] }) })
    expect(r.newer).toBe(true)
    expect(r.latest).toBe('9.9.9')
    expect(r.download).toBe('https://dl/Bench-Setup-9.9.9.exe')
    expect(r.asset).toEqual({ id: 2, name: 'Bench-Setup-9.9.9.exe', size: 10, url: 'https://dl/Bench-Setup-9.9.9.exe' })
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

describe('download', () => {
  it('refuses when nothing newer is cached', async () => {
    await check({ force: true, fetchImpl: async () => res(200, { tag_name: 'v0.0.1', assets: [] }) })
    await expect(download({ fetchImpl: async () => { throw new Error('must not fetch') } })).rejects.toThrow(/is the latest/)
    expect(downloaded()).toBeNull()
  })
  it('fetches the public asset into the temp folder through a .part file and remembers it', async () => {
    clean()
    const payload = Buffer.from('MZ fake installer bytes')
    const urls = []
    const fetchImpl = async (url, init) => {
      urls.push(url)
      if (url.endsWith('/releases/latest')) return res(200, release(payload.length))
      expect(init.headers.Authorization).toBeUndefined()
      return bytes(200, payload)
    }
    await check({ force: true, fetchImpl })
    const r = await download({ fetchImpl })
    expect(r).toMatchObject({ version: '99.0.0', path: FILE, size: payload.length })
    expect(urls[1]).toBe(`https://dl/${NAME}`)
    expect(fs.readFileSync(FILE)).toEqual(payload)
    expect(fs.existsSync(FILE + '.part')).toBe(false)
    const d = downloaded()
    expect(d).toMatchObject({ version: '99.0.0', path: FILE })
    expect(typeof d.at).toBe('string')
    expect(JSON.parse(fs.readFileSync(path.join(process.env.BENCH_USER_DIR, 'update.json'), 'utf8')).version).toBe('99.0.0')
  })
  it('skips a file that is already complete', async () => {
    let fetched = 0
    const fetchImpl = async () => { fetched++; throw new Error('should not download again') }
    const r = await download({ fetchImpl })
    expect(r.alreadyThere).toBe(true)
    expect(fetched).toBe(0)
  })
  it('goes through the API with a token and drops a short file', async () => {
    clean()
    process.env.GITHUB_TOKEN = 'ghp_test'
    const urls = []
    const fetchImpl = async (url, init) => {
      urls.push(url)
      if (url.endsWith('/releases/latest')) return res(200, release(50))
      expect(init.headers.Accept).toBe('application/octet-stream')
      expect(init.headers.Authorization).toBe('Bearer ghp_test')
      return bytes(200, Buffer.from('too short'))
    }
    await check({ force: true, fetchImpl })
    await expect(download({ fetchImpl })).rejects.toThrow(/GitHub said 50/)
    expect(urls[1]).toMatch(/api\.github\.com\/repos\/.+\/releases\/assets\/4242$/)
    expect(fs.existsSync(FILE)).toBe(false)
    expect(fs.existsSync(FILE + '.part')).toBe(false)
    expect(downloaded()).toBeNull()
    delete process.env.GITHUB_TOKEN
  })
  it('forgets a downloaded installer that vanished', async () => {
    clean()
    const payload = Buffer.from('MZ again')
    const fetchImpl = async (url) => url.endsWith('/releases/latest') ? res(200, release(payload.length)) : bytes(200, payload)
    await check({ force: true, fetchImpl })
    await download({ fetchImpl })
    expect(downloaded()).not.toBeNull()
    fs.unlinkSync(FILE)
    expect(downloaded()).toBeNull()
  })
})

describe('start and routes', () => {
  it('checks after the first delay and downloads what is newer', async () => {
    clean()
    const payload = Buffer.from('MZ scheduled')
    const lines = []
    const fetchImpl = async (url) => url.endsWith('/releases/latest') ? res(200, release(payload.length)) : bytes(200, payload)
    start({ fetchImpl, firstMs: 5, everyMs: 60_000, log: l => lines.push(l) })
    await new Promise(r => setTimeout(r, 120))
    stop()
    expect(lines.some(l => /downloaded to/.test(l))).toBe(true)
    expect(downloaded()?.version).toBe('99.0.0')
  })
  it('registers GET /api/updates with the downloaded state and POST /api/updates/download', async () => {
    const routes = {}
    registerRoutes({ get: (p, h) => { routes['GET ' + p] = h }, post: (p, h) => { routes['POST ' + p] = h } })
    expect(Object.keys(routes).sort()).toEqual(['GET /api/updates', 'POST /api/updates/download'])
    const out = await new Promise(resolve => routes['GET /api/updates']({ query: {} }, { json: resolve, status: () => ({ json: resolve }) }))
    expect(out.downloaded?.version).toBe('99.0.0')
    expect(out.latest).toBe('99.0.0')
  })
})
