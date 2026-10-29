/** Run the offline native capture executable on this fixture's explicit inputs.
 * Tape comes from the separately tested nativeRandom; this verifies consumer
 * order and geometry, NOT an independent PRNG implementation.
 * node --import tsx runCapture.mjs /path/to/native-capture /path/to/result.json
 */
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { KritaRandomSource } from '../../nativeRandom.ts'

const fixture = JSON.parse(fs.readFileSync(new URL('./consumer.native.json', import.meta.url), 'utf8'))
let input = ''
for (const c of fixture.cases) {
  const p = c.particle, r = c.rotation, color = c.color, q = c.request
  const random = new KritaRandomSource(c.seed)
  const tape = Array.from({ length: 256 }, () => random.generate())
  input += [
    c.name, c.seed, c.diameter, c.aspect, c.cloudScale, c.cloudAngle * 180 / Math.PI, c.count, +c.normal,
    +(p.kind === 'ellipse'), p.width, p.height, +!!p.proportional, +p.randomSize,
    +(r.fixed !== undefined), (r.fixed ?? 0) * 180 / Math.PI,
    +(r.randomWeight !== undefined), r.randomWeight ?? 0,
    +(r.polarWeight !== undefined), r.polarWeight ?? 0,
    +(r.directionWeight !== undefined), r.directionWeight ?? 0,
    +color.perParticle, +(color.hsv !== undefined),
    (color.hsv?.[0] ?? 0) * 180, (color.hsv?.[1] ?? 0) * 100, (color.hsv?.[2] ?? 0) * 100,
    +color.randomOpacity, p.frameCount ?? 0,
    q.x, q.y, q.sizeScale, q.lodScale, q.angle, q.drawingAngle, q.foregroundOpacity,
    tape.length, ...tape,
  ].join(' ') + '\n'
}
const result = spawnSync(process.argv[2], [], { input, encoding: 'utf8' })
if (result.status !== 0) throw new Error(result.stderr || `Native capture exited ${result.status}`)
fs.writeFileSync(process.argv[3], result.stdout)
