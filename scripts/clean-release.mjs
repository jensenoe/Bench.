#!/usr/bin/env node
/**
 * Empties release/ before a build, so installers of old versions stop piling up (3 GB on 29 Sep), and
 * never deletes an installed Bench.: a folder that holds "Uninstall Bench.exe" is an installation someone
 * pointed the installer at, and wiping it would leave Windows with a broken uninstall entry.
 *
 *   node scripts/clean-release.mjs          remove old builds, keep and name any installation it finds
 *   node scripts/clean-release.mjs --dry    say what would go
 *
 * Exit code 0 either way; an installation found inside release/ is reported, not fatal, because the build
 * can go ahead next to it. build-exe.bat and `npm run dist:win` call this first.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const RELEASE = path.join(root, 'release')
const UNINSTALLER = /^Uninstall Bench\.exe$/i

/** A folder is an installation when it (or its first level) carries the NSIS uninstaller. */
export function isInstallation(dir) {
  try {
    return fs.readdirSync(dir).some(f => UNINSTALLER.test(f))
  } catch { return false }
}

/** What would be removed and what is kept, without touching anything. */
export function plan(dir = RELEASE) {
  if (!fs.existsSync(dir)) return { remove: [], keep: [] }
  const remove = [], keep = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const isDir = fs.statSync(full).isDirectory()
    if (isDir && isInstallation(full)) keep.push(full)
    else remove.push(full)
  }
  return { remove, keep }
}

export function clean(dir = RELEASE, { dry = false, log = console.log } = {}) {
  const p = plan(dir)
  for (const f of p.remove) {
    if (dry) { log(`  would remove ${path.relative(root, f)}`); continue }
    try { fs.rmSync(f, { recursive: true, force: true }) } catch (err) { log(`  could not remove ${path.relative(root, f)}: ${err.message}`) }
  }
  for (const f of p.keep) {
    log('')
    log(`  Kept ${path.relative(root, f)}: Bench. is INSTALLED there, inside the build folder.`)
    log('  Uninstall it from Windows Settings > Apps, then run the new installer and keep the')
    log('  suggested folder (%LOCALAPPDATA%\\Programs\\Bench). Your board and hours are in %APPDATA%\\bench')
    log('  and are not touched by either step.')
    log('')
  }
  return p
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dry = process.argv.includes('--dry')
  const p = clean(RELEASE, { dry })
  console.log(`  release/: ${dry ? 'would remove' : 'removed'} ${p.remove.length}, kept ${p.keep.length} installation${p.keep.length === 1 ? '' : 's'}.`)
}
