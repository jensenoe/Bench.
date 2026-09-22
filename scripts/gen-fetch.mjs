/**
 * Regenerates fetch-photos.bat from src/library.json and refreshes the photo counts in README.md.
 *
 *   npm run photos:bat
 *
 * The bat is pure ASCII with CRLF line endings so cmd.exe reads it the same on every machine.
 * Photographer names are transliterated (diacritics dropped, Cyrillic romanised) because cmd
 * echoes them in the OEM code page. Never hand-edit the bat; change library.json and rerun this.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const library = JSON.parse(fs.readFileSync(path.join(root, 'src', 'library.json'), 'utf8'))
const BAT = path.join(root, 'fetch-photos.bat')
const README = path.join(root, 'README.md')

/** The five files that are not photographs: procedural renders and the ridge. Never pruned. */
const KEEP = ['dawn.jpg', 'day.jpg', 'dusk.jpg', 'night.jpg', 'ridge.jpg']
const SCENES = ['dawn', 'day', 'dusk', 'night']

// ── entries in library order ─────────────────────────────────────────
const entries = []
const perLibrary = {}
for (const [key, lib] of Object.entries(library)) {
  if (key === '_sky') continue
  const lists = lib.images ? [lib.images] : SCENES.map(s => lib[s] || [])
  perLibrary[key] = 0
  for (const list of lists) for (const e of list) {
    if (!e.file || !e.url) throw new Error(`${key}: entry without file or url: ${JSON.stringify(e)}`)
    if (!e.file.endsWith('.jpg')) throw new Error(`${key}: ${e.file} is not a .jpg`)
    entries.push(e)
    perLibrary[key]++
  }
}
const dupes = entries.map(e => e.file).filter((f, i, a) => a.indexOf(f) !== i)
if (dupes.length) throw new Error(`duplicate files in library.json: ${[...new Set(dupes)].join(', ')}`)

const sceneLibraries = Object.keys(perLibrary).filter(k => !library[k].images)
const covers = Object.keys(perLibrary).filter(k => library[k].images)

// ── ASCII for cmd.exe ────────────────────────────────────────────────
const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya'
}
const SPECIAL = { ł: 'l', Ł: 'L', ı: 'i', ø: 'o', Ø: 'O', ß: 'ss', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', đ: 'd', Đ: 'D', þ: 'th', Þ: 'Th', ð: 'd', Ð: 'D' }
export function ascii(s) {
  let out = ''
  for (const ch of String(s || '')) {
    if (SPECIAL[ch]) { out += SPECIAL[ch]; continue }
    const lower = ch.toLowerCase()
    if (CYRILLIC[lower] !== undefined) {
      const t = CYRILLIC[lower]
      out += ch === lower ? t : t.charAt(0).toUpperCase() + t.slice(1)
      continue
    }
    out += ch
  }
  return out.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/["%]/g, '')      // a quote ends the argument, a percent starts a variable
    .replace(/\s+/g, ' ').trim()
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
const word = n => WORDS[n] || String(n)
const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

// ── the bat ──────────────────────────────────────────────────────────
const lines = [
  '@echo off',
  'setlocal',
  'cd /d "%~dp0public\\terrain"',
  'title Fetch photographs',
  'echo.',
  `echo   Fetching ${entries.length} photographs (Pexels and Unsplash, free licences).`,
  `echo   ${cap(word(sceneLibraries.length))} libraries from the Alps to Edinburgh, plus ${covers.map(k => library[k].label).join(' and ')} covers.`,
  'echo   Existing files are skipped, so rerunning is cheap. Pictures no longer in the',
  'echo   library are removed at the end.',
  'echo.',
  'where curl >nul 2>&1',
  'if errorlevel 1 ( echo   curl.exe not found. It ships with Windows 10 1803 and later. & pause & exit /b 1 )',
  'set MANIFEST=%TEMP%\\bench-photos.txt',
  '(',
  ...entries.map(e => `echo ${e.file}`),
  ...KEEP.map(f => `echo ${f}`),
  ') > "%MANIFEST%"',
  ...entries.map(e => `call :get ${e.file.replace(/\.jpg$/, '')} "${e.url}" "${ascii(e.by) || 'Pexels'}"`),
  'echo.',
  'echo   Removing pictures that left the library...',
  'for %%f in (*.jpg) do ( findstr /x /i /c:"%%f" "%MANIFEST%" >nul || ( echo   - %%f & del "%%f" ) )',
  'del "%MANIFEST%" >nul 2>&1',
  'echo.',
  'echo   Done. Restart Bench. to see them.',
  'if /i not "%~1"=="nopause" pause',
  'exit /b 0',
  '',
  ':get',
  'if exist "%~1.jpg" ( exit /b 0 )',
  'echo   %~1  ^<- %~3',
  'curl -sL -o "%~1.jpg" "%~2"',
  'if errorlevel 1 echo      FAILED for %~1',
  'exit /b 0'
]
const bat = lines.join('\r\n') + '\r\n'
const bad = [...bat].filter(c => c.charCodeAt(0) > 0x7e || (c.charCodeAt(0) < 0x20 && c !== '\r' && c !== '\n'))
if (bad.length) throw new Error(`non-ASCII in generated bat: ${[...new Set(bad)].join(' ')}`)
fs.writeFileSync(BAT, bat, 'latin1')

// ── README counts ────────────────────────────────────────────────────
let readme = fs.readFileSync(README, 'utf8')
const before = readme
const sizes = sceneLibraries.map(k => perLibrary[k])
readme = readme
  .replace(/^\d+ photographs from Pexels and Unsplash/m, `${entries.length} photographs from Pexels and Unsplash`)
  .replace(/\d+ to \d+ each across dawn, day, dusk and night/, `${Math.min(...sizes)} to ${Math.max(...sizes)} each across dawn, day, dusk and night`)
if (perLibrary.lunch) readme = readme.replace(/\b\w+ alpine villages at dusk/, `${word(perLibrary.lunch)} alpine villages at dusk`)
if (perLibrary.cockpit) readme = readme.replace(/\b\w+ offices and benches/, `${word(perLibrary.cockpit)} offices and benches`)
if (readme !== before) fs.writeFileSync(README, readme)

console.log(`fetch-photos.bat: ${entries.length} photographs in ${sceneLibraries.length} libraries plus ${covers.length} covers`)
for (const [k, n] of Object.entries(perLibrary)) console.log(`  ${k.padEnd(10)} ${n}`)
console.log(readme !== before ? 'README.md counts updated' : 'README.md already current')
