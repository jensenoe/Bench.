import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import library from '../src/library.json'
import { COLLECTIONS } from '../src/scenes.js'

const TERRAIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'terrain')
const SCENES = ['dawn', 'day', 'dusk', 'night']
const redwoods = library.redwoods
const entries = SCENES.flatMap(s => redwoods[s])
// The photographs are gitignored and arrive via fetch-photos.bat; a fresh clone has none yet.
const fetched = fs.existsSync(TERRAIN) && fs.readdirSync(TERRAIN).some(f => /^[a-z]+-(dawn|day|dusk|night)-.+\.jpg$/.test(f))

describe('redwoods library', () => {
  it('is a collection with its own label', () => {
    expect(redwoods.label).toBe('Redwoods')
    expect(COLLECTIONS.map(c => c.key)).toContain('redwoods')
  })
  it('has at least six pictures per scene, each named for its scene and credited', () => {
    for (const s of SCENES) {
      expect(redwoods[s].length, s).toBeGreaterThanOrEqual(6)
      for (const e of redwoods[s]) {
        expect(e.file).toMatch(new RegExp(`^redwoods-${s}-[0-9a-z]+\\.jpg$`))
        expect(e.url).toMatch(/^https:\/\/images\.(pexels|unsplash)\.com\/.+w=3200&h=1800&fit=crop/)
        expect(e.by.trim().length).toBeGreaterThan(0)
      }
    }
    expect(new Set(entries.map(e => e.file)).size).toBe(entries.length)
  })
  it.skipIf(!fetched)('every listed picture is in public/terrain', () => {
    const missing = entries.map(e => e.file).filter(f => !fs.existsSync(path.join(TERRAIN, f)))
    expect(missing).toEqual([])
  })
})
