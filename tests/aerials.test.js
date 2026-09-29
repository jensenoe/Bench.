import { describe, it, expect, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-aerials-'))
process.env.BENCH_USER_DIR = path.join(tmp, 'user')
process.env.BENCH_DATA_DIR = path.join(tmp, 'data')
const aerials = await import('../server/aerials.js')
const { CLIPS, SCENES, NEAR, pickClip, wanted, aerialCredits } = await import('../src/aerials.js')
const catalogue = JSON.parse(fs.readFileSync(new URL('../src/aerials.json', import.meta.url), 'utf8'))

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('catalogue', () => {
  it('has collections with a key, a label and clips', () => {
    expect(catalogue.collections.length).toBeGreaterThanOrEqual(3)
    for (const c of catalogue.collections) {
      expect(c.key).toMatch(/^[a-z]{2,20}$/)
      expect(c.label).toBeTruthy()
      expect(c.clips.length).toBeGreaterThan(0)
    }
  })
  it('gives every clip an id, a file, a poster, a place and one of the four scenes', () => {
    for (const x of CLIPS) {
      expect(Number.isInteger(x.id)).toBe(true)
      expect(x.file).toMatch(/^https:\/\/videos\.pexels\.com\/video-files\/\d+\/[\w-]+\.mp4$/)
      expect(x.file).toContain(`/${x.id}/`)
      expect(x.poster).toMatch(/^https:\/\/images\.pexels\.com\/videos\/\d+\/(pictures\/)?[\w.-]+\.(jpe?g)$/)
      expect(x.poster).toContain(`/${x.id}/`)
      expect(SCENES).toContain(x.scene)
      expect(typeof x.place).toBe('string')
      expect(x.place.length).toBeGreaterThan(1)
      expect(typeof x.by).toBe('string')
    }
  })
  it('has no clip twice and several clips for every time of day', () => {
    expect(new Set(CLIPS.map(x => x.id)).size).toBe(CLIPS.length)
    for (const s of SCENES) expect(CLIPS.filter(x => x.scene === s).length).toBeGreaterThanOrEqual(3)
  })
  it('keeps to the house copy rules and lists who filmed what', () => {
    expect(JSON.stringify(catalogue)).not.toContain(String.fromCharCode(0x2014))   // no em dashes, written as a code so this file has none either
    expect(aerialCredits().length).toBeGreaterThan(3)
  })
  it('matches what the server reads', () => {
    expect(aerials.allClips().map(x => x.id)).toEqual(CLIPS.map(x => x.id))
  })
})

describe('the clip picker', () => {
  const clips = [
    { id: 1, scene: 'night', collection: 'cities' },
    { id: 2, scene: 'night', collection: 'cities' },
    { id: 3, scene: 'dusk', collection: 'cities' },
    { id: 4, scene: 'day', collection: 'coast' },
    { id: 5, scene: 'dawn', collection: 'coast' },
    { id: 6, scene: 'night', collection: 'coast' }
  ]
  const all = clips.map(c => c.id)

  it('follows the scene', () => {
    for (let r = 0; r < 20; r++) expect(pickClip({ clips, scene: 'night', ready: all, random: () => r / 20 }).scene).toBe('night')
    expect(pickClip({ clips, scene: 'dusk', ready: all }).id).toBe(3)
    expect(pickClip({ clips, scene: 'dawn', ready: all }).id).toBe(5)
  })
  it('never repeats the clip just shown', () => {
    for (let r = 0; r < 20; r++) expect(pickClip({ clips, scene: 'night', ready: all, last: 1, random: () => r / 20 }).id).not.toBe(1)
    // the only dusk clip was just shown: the next comes from the nearest scene, not a repeat
    const p = pickClip({ clips, scene: 'dusk', ready: all, last: 3 })
    expect(p.id).not.toBe(3)
    expect(p.scene).toBe('night')
  })
  it('falls back to the neighbouring scenes when this one has nothing cached', () => {
    expect(pickClip({ clips, scene: 'dusk', ready: [1, 4] }).scene).toBe('night')   // dusk borrows from night first
    expect(pickClip({ clips, scene: 'dawn', ready: [3, 4] }).scene).toBe('day')     // dawn borrows from day first
    expect(pickClip({ clips, scene: 'day', ready: [5, 6] }).scene).toBe('dawn')
    expect(pickClip({ clips, scene: 'night', ready: [4, 3] }).scene).toBe('dusk')
    for (const s of SCENES) { expect(NEAR[s][0]).toBe(s); expect([...NEAR[s]].sort()).toEqual([...SCENES].sort()) }
  })
  it('keeps to the collection, and gives nothing rather than the same clip again', () => {
    expect(pickClip({ clips, scene: 'night', collection: 'coast', ready: all }).id).toBe(6)
    expect(pickClip({ clips, scene: 'night', collection: 'coast', ready: all, last: 6 }).collection).toBe('coast')
    expect(pickClip({ clips, scene: 'night', ready: [2], last: 2 })).toBeNull()
    expect(pickClip({ clips, scene: 'night', ready: [] })).toBeNull()
  })
  it('prefers clips not shown lately when there is a choice', () => {
    expect(pickClip({ clips, scene: 'night', ready: all, last: 1, recent: [2] }).id).toBe(6)
  })
  it('asks for this scene first, then its neighbours, a few at a time', () => {
    expect(wanted({ clips, scene: 'night', ready: [], n: 3 })).toEqual([1, 2, 6])
    expect(wanted({ clips, scene: 'night', ready: [1, 2, 6], n: 2 })).toEqual([3, 5])
    expect(wanted({ clips, scene: 'day', collection: 'coast', ready: [4], n: 3 })).toEqual([5, 6])
  })
})

describe('the cache', () => {
  const dir = path.join(tmp, 'cache')
  let t = 1000
  const cache = aerials.createCache({ dir, cap: 300, now: () => t })
  const put = (name, bytes) => { fs.writeFileSync(path.join(dir, name), Buffer.alloc(bytes)); t += 10; return cache.add(name) }

  it('counts what it holds', () => {
    expect(cache.size()).toBe(0)
    put('1.mp4', 100); put('1.jpg', 20); put('2.mp4', 100)
    expect(cache.size()).toBe(220)
    expect(cache.has('1.mp4')).toBe(true)
  })
  it('evicts the least recently used past the cap, never the file just added', () => {
    t += 10; cache.touch('1.mp4')          // 1.mp4 was served, so 1.jpg is now the oldest, then 2.mp4
    const gone = put('3.mp4', 150)          // 370 > 300
    expect(gone).toEqual(['1.jpg', '2.mp4'])
    expect(cache.has('3.mp4')).toBe(true)
    expect(cache.has('1.mp4')).toBe(true)
    expect(fs.existsSync(path.join(dir, '2.mp4'))).toBe(false)
    expect(cache.size()).toBeLessThanOrEqual(300)
  })
  it('keeps a single file larger than the cap rather than deleting what was just fetched', () => {
    const gone = put('4.mp4', 400)
    expect(gone.sort()).toEqual(['1.mp4', '3.mp4'])
    expect(cache.list()).toEqual(['4.mp4'])
  })
  it('squares the index with the folder on load: a half download goes, a stranger is ignored', () => {
    cache.flush()
    fs.writeFileSync(path.join(dir, '5.mp4.part'), 'x')
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'x')
    const again = aerials.createCache({ dir, cap: 300 })
    expect(again.list()).toEqual(['4.mp4'])
    expect(fs.existsSync(path.join(dir, '5.mp4.part'))).toBe(false)
  })
  it('clears', () => {
    cache.clear()
    expect(cache.size()).toBe(0)
    expect(fs.existsSync(path.join(dir, '4.mp4'))).toBe(false)
  })
})

describe('Range', () => {
  it('parses the forms media elements send', () => {
    expect(aerials.parseRange(undefined, 1000)).toBeNull()
    expect(aerials.parseRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 })
    expect(aerials.parseRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 })
    expect(aerials.parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
    expect(aerials.parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(aerials.parseRange('bytes=0-1,5-6', 1000)).toEqual({ start: 0, end: 1 })
    for (const bad of ['bytes=1000-', 'bytes=500-100', 'bytes=-', 'bytes=-0', 'items=0-1', 'nonsense']) expect(aerials.parseRange(bad, 1000)).toEqual({ invalid: true })
  })

  it('serves whole files, ranges and refusals', async () => {
    const file = path.join(tmp, 'clip.mp4')
    const body = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256))
    fs.writeFileSync(file, body)
    const server = http.createServer((req, res) => aerials.sendFile(req, res, file, 'video/mp4'))
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    const url = `http://127.0.0.1:${server.address().port}/`
    try {
      const whole = await fetch(url)
      expect(whole.status).toBe(200)
      expect(whole.headers.get('accept-ranges')).toBe('bytes')
      expect(whole.headers.get('content-type')).toBe('video/mp4')
      expect(Buffer.from(await whole.arrayBuffer()).equals(body)).toBe(true)

      const part = await fetch(url, { headers: { Range: 'bytes=100-199' } })
      expect(part.status).toBe(206)
      expect(part.headers.get('content-range')).toBe('bytes 100-199/1000')
      expect(part.headers.get('content-length')).toBe('100')
      expect(Buffer.from(await part.arrayBuffer()).equals(body.subarray(100, 200))).toBe(true)

      const tail = await fetch(url, { headers: { Range: 'bytes=-10' } })
      expect(tail.status).toBe(206)
      expect(Buffer.from(await tail.arrayBuffer()).equals(body.subarray(990))).toBe(true)

      const open = await fetch(url, { headers: { Range: 'bytes=0-' } })
      expect(open.status).toBe(206)
      expect(open.headers.get('content-range')).toBe('bytes 0-999/1000')
      await open.arrayBuffer()

      const refused = await fetch(url, { headers: { Range: 'bytes=5000-' } })
      expect(refused.status).toBe(416)
      expect(refused.headers.get('content-range')).toBe('bytes */1000')
    } finally { await new Promise(r => server.close(r)) }
  })

  it('serves only cached catalogue names under /media/aerials', () => {
    for (const ok of ['5538825.mp4', '5538825.jpg']) expect(aerials.NAME.test(ok)).toBe(true)
    for (const bad of ['../settings.json', '..\\x.mp4', 'a.mp4', '1.mp4.part', '1.exe', 'index.json', '1/2.mp4']) expect(aerials.NAME.test(bad)).toBe(false)
  })
})

describe('prefetch', () => {
  it('takes only catalogue ids and queues posters before clips', () => {
    const dir = path.join(tmp, 'queue')
    aerials._useCache(aerials.createCache({ dir, cap: 1e9 }))
    // An id that is not in the catalogue is dropped before anything reaches the network.
    expect(aerials.prefetch(['999999999999', 'x'])).toBe(0)
    const st = aerials.status()
    expect(st.clips.length).toBe(CLIPS.length)
    expect(st.clips.every(c => c.ready === false)).toBe(true)
    expect(st.cache.bytes).toBe(0)
    aerials.clear()
  })
})
