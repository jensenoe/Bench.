import { describe, it, expect } from 'vitest'
import { pickClip, wanted, shuffle, collectionOf, ID } from '../src/aerials.js'

const clips = [
  { id: 'a', collection: 'cities', scene: 'night' },
  { id: 'b', collection: 'cities', scene: 'day' },
  { id: 'c', collection: 'coast', scene: 'dawn' },
  { id: 'd', collection: 'coast', scene: 'dusk' },
  { id: 'e', collection: 'iceland', scene: 'day' }
]
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length] }

describe('the clip picker (roadmap 159)', () => {
  it('picks from every clip whatever the hour, never the one on screen', () => {
    const seen = new Set()
    for (let i = 0; i < 50; i++) seen.add(pickClip({ clips, ready: clips.map(c => c.id), last: 'a' }).clip.id)
    expect([...seen].sort()).toEqual(['b', 'c', 'd', 'e'])
  })
  it('shows every ready clip once before any comes round again', () => {
    const ready = clips.map(c => c.id)
    let played = [], last = null
    const shown = []
    for (let i = 0; i < 10; i++) {
      const r = pickClip({ clips, ready, last, played })
      if (!r.fresh) played = last ? [last] : []
      played.push(r.clip.id); shown.push(r.clip.id); last = r.clip.id
    }
    expect(new Set(shown.slice(0, 5)).size).toBe(5)
    expect(new Set(shown.slice(5, 10)).size).toBeGreaterThanOrEqual(4)
    for (let i = 1; i < shown.length; i++) expect(shown[i]).not.toBe(shown[i - 1])
  })
  it('a newly cached clip is fresh and comes before repeats', () => {
    const r = pickClip({ clips, ready: ['a', 'b', 'e'], last: 'b', played: ['a', 'b'], random: () => 0 })
    expect(r).toEqual({ clip: clips[4], fresh: true })
  })
  it('keeps to the collection; a collection that no longer exists means all', () => {
    for (let i = 0; i < 20; i++) expect(pickClip({ clips, collection: 'coast', ready: clips.map(c => c.id) }).clip.collection).toBe('coast')
    expect(collectionOf('australia', clips)).toBe('all')
    expect(collectionOf('coast', clips)).toBe('coast')
    expect(pickClip({ clips, collection: 'australia', ready: ['e'] }).clip.id).toBe('e')
  })
  it('nothing else ready gives null, not the same clip again', () => {
    expect(pickClip({ clips, ready: ['a'], last: 'a' })).toBeNull()
    expect(pickClip({ clips, ready: [] })).toBeNull()
  })
  it('downloads follow the session order, skip what is cached, a few at a time', () => {
    expect(wanted({ clips, ready: ['c'], order: ['e', 'c', 'a', 'd', 'b'], n: 3 })).toEqual(['e', 'a', 'd'])
    expect(wanted({ clips, collection: 'cities', ready: [], order: ['e', 'c', 'a', 'd', 'b'] })).toEqual(['a', 'b'])
    expect(wanted({ clips, ready: clips.map(c => c.id) })).toEqual([])
  })
  it('shuffles without losing or doubling anything', () => {
    const out = shuffle(['a', 'b', 'c', 'd'], seq(0.9, 0.1, 0.5))
    expect([...out].sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(ID.test('pexels-5538825') && ID.test('mixkit-4k-2152') && ID.test('5538825')).toBe(true)
    expect(ID.test('../x') || ID.test('A1') || ID.test('-a')).toBe(false)
  })
})
