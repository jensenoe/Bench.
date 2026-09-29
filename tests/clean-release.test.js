import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { plan, clean, isInstallation } from '../scripts/clean-release.mjs'

const tree = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-release-'))
  for (const f of ['Bench-Setup-0.11.0-beta.17.exe', 'Bench-Setup-0.11.0-beta.17.exe.blockmap', 'Bench-portable-0.11.0-beta.17.exe', 'latest.yml', 'builder-debug.yml']) fs.writeFileSync(path.join(dir, f), 'x')
  fs.mkdirSync(path.join(dir, 'win-unpacked')); fs.writeFileSync(path.join(dir, 'win-unpacked', 'Bench.exe'), 'x')
  fs.mkdirSync(path.join(dir, 'Bench')); fs.writeFileSync(path.join(dir, 'Bench', 'Bench.exe'), 'x'); fs.writeFileSync(path.join(dir, 'Bench', 'Uninstall Bench.exe'), 'x')
  return dir
}

describe('clean-release', () => {
  it('knows an installation by its uninstaller', () => {
    const dir = tree()
    expect(isInstallation(path.join(dir, 'Bench'))).toBe(true)
    expect(isInstallation(path.join(dir, 'win-unpacked'))).toBe(false)
  })
  it('removes old builds and keeps the installation', () => {
    const dir = tree()
    const lines = []
    const p = clean(dir, { log: l => lines.push(l) })
    expect(p.keep).toEqual([path.join(dir, 'Bench')])
    expect(fs.readdirSync(dir)).toEqual(['Bench'])
    expect(fs.existsSync(path.join(dir, 'Bench', 'Uninstall Bench.exe'))).toBe(true)
    expect(lines.join('\n')).toMatch(/INSTALLED there/)
  })
  it('dry run touches nothing', () => {
    const dir = tree()
    const before = fs.readdirSync(dir).sort()
    const p = clean(dir, { dry: true, log: () => {} })
    expect(p.remove.length).toBe(6)
    expect(fs.readdirSync(dir).sort()).toEqual(before)
  })
  it('a missing release folder is fine', () => {
    expect(plan(path.join(os.tmpdir(), 'bench-no-such-release'))).toEqual({ remove: [], keep: [] })
  })
})
