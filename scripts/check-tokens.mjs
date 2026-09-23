/**
 * Colours only through tokens. Fails when a component carries a raw hex colour instead of a token from
 * src/index.css (--late, --caution, --ok, --held, --accent, --ink...) or STATUS from src/scenes.js.
 *
 *   node scripts/check-tokens.mjs        (runs as part of `npm run lint`)
 *
 * Where the tokens are defined (index.css, scenes.js, library.json) is skipped. A line that has to stay
 * literal, such as the Napkin palette that is baked into SVG exports, says so with "tokens-ok" in a comment.
 * Adapted from the design-system skill's validate-tokens script, cut down to what matters here.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const defines = new Set(['index.css', 'scenes.js', 'library.json'])
const HEX = /#(?:[0-9A-Fa-f]{3}){1,2}\b/g

const files = []
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : /\.(jsx?|css)$/.test(e.name) && files.push(p) } }
walk(root)

const hits = []
for (const f of files) {
  if (defines.has(path.basename(f))) continue
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (line.includes('tokens-ok')) return
    const m = line.match(HEX)
    if (m) hits.push(`${path.relative(process.cwd(), f)}:${i + 1}  ${m.join(' ')}`)
  })
}
if (hits.length) {
  console.error(`Raw colours outside the token files (${hits.length}). Use var(--late|--caution|--ok|--held|--accent) or STATUS from scenes.js:`)
  for (const h of hits) console.error('  ' + h)
  process.exit(1)
}
console.log(`Tokens: ${files.length} files, no raw colours outside index.css, scenes.js and library.json.`)
