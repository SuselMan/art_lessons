/** Fallback sample generator for loadTest.ts, for when a dump of real prod
 *  operations is not to hand.
 *
 *  Real samples are still the better input and the harness asks for them first
 *  — see its own docstring. What makes this an acceptable stand-in rather than
 *  the synthetic shape that one warns against is that the server never decodes
 *  a dab: it accepts, relays, compresses and stores an opaque string. So what
 *  it costs is decided by payload *size* and arrival *pacing*, and both are
 *  reproduced here — sizes are packed with the real packDabs to the
 *  distribution the harness cites from prod (median ~4.8 KB, p90 ~28 KB), and
 *  dab timing comes from a tablet trace taken 11.08 (~800 dabs/s), which is
 *  what decides how many live packets (#429) a stroke splits into.
 *
 *  What it does not reproduce is the *content* of a stroke, so it is no use for
 *  anything that renders or replays these — only for load.
 *
 *    node --import tsx src/scripts/synthStrokeSamples.mts /path/to/strokes.json
 */
import { packDabs } from '@grafetto/shared'
import { writeFileSync } from 'node:fs'

const OUT = process.argv[2]
if (!OUT) throw new Error('usage: gensamples.mts <output.json>')

const DAB_MS = 1.25
const counts = [
  18, 24, 30, 36, 44, 52, 60, 68, 76, 84,
  92, 92, 96, 104, 112, 124, 140, 160, 180, 200,
  230, 260, 300, 340, 380, 430, 480, 538, 600, 700,
]
const samples = counts.map((n, i) => {
  const dabs = Array.from({ length: n }, (_, k) => ({
    x: 100 + k * 1.7 + i, y: 300 + Math.sin(k / 9) * 40,
    pressure: 0.55 + 0.3 * Math.sin(k / 13), tiltX: 0.1, tiltY: -0.05,
    size: 22, aspectRatio: 1, angle: 0.2, opacity: 0.7, t: Math.round(k * DAB_MS * 10) / 10,
  }))
  return {
    id: 'sample', type: 'stroke', userId: 'load', timestamp: 0,
    layerId: 'layer-load', tool: 'pencil', preset: 'HB', color: [0.14, 0.14, 0.17],
    dabsPacked: packDabs(dabs), strokeId: 'sample',
  }
})
const sizes = samples.map(s => s.dabsPacked.length).sort((a, b) => a - b)
const pct = (p: number): number => sizes[Math.floor(sizes.length * p)]!
console.log(`${samples.length} samples | packed median ${(pct(0.5) / 1024).toFixed(1)} KB | p90 ${(pct(0.9) / 1024).toFixed(1)} KB | max ${(sizes.at(-1)! / 1024).toFixed(1)} KB`)
writeFileSync(OUT, JSON.stringify(samples))
console.log('written to', OUT)
