/** Validate every imported component using the authoritative built shared guard.
 * Run `pnpm --filter @grafetto/shared build` after shared contract changes first.
 */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { isBrushLibrary } from '../../packages/shared/dist/brushes.js'

const path = process.argv[2]
if (!path) throw new Error('Usage: node validate_catalog.mjs /path/to/manifest.json')
const library = JSON.parse(fs.readFileSync(path, 'utf8'))
const invalid = library.brushes.filter(brush => !isBrushLibrary({ ...library, brushes: [brush] })).map(brush => brush.name)
const valid = isBrushLibrary(library)
const report = {
  valid, brushes: library.brushes.length, assets: library.assets.length,
  invalidBrushes: invalid,
  manifestSha256: createHash('sha256').update(fs.readFileSync(path)).digest('hex'),
  sharedGuardSha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(new URL('../../packages/shared/dist/brushes.js', import.meta.url)))).digest('hex'),
}
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
if (!valid) process.exitCode = 1
