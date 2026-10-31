import { expect, it, vi } from 'vitest'
import type { CanonicalSoftAutoRecipe, CanonicalSoftAutoSource } from '@grafetto/shared'
import tables from '../presets/fixtures/sourceSoftCircle/tables.native.json'
import whole from '../presets/fixtures/sourceSoftCircle/whole.native.json'
import { recordingGL } from '../../testing/brushPassTestUtils'
import { BrushMipCache } from './BrushMipCache'
import { BrushTextureCache } from './BrushTextureCache'
import { CanonicalSoftCircleProgramOwner } from './CanonicalSoftCircleProgramOwner'
import { TransformedMaskPrepass, type CanonicalAutoMaskRequest } from './TransformedMaskPrepass'
import { canonicalAutoMaskRevision } from './TransformedMaskPlan'

function setup(slots = 1) {
  const { gl } = recordingGL(), cpu = new BrushMipCache(), cache = new BrushTextureCache(gl, 4 * 1024 * 1024)
  gl.texSubImage2D = vi.fn()
  const service = new TransformedMaskPrepass(gl, cache, cpu, 'soft-test')
  service.prepare({ width: 256, height: 256, slots }, [])
  return { gl, cpu, cache, service }
}
function request(cpu: BrushMipCache, c = whole.cases[0]) {
  const row = tables.constructors.find(r => r.index === c.index)!, g = row.generator
  const softnessCurve = { text: row.points.map(p => `${p.x},${p.y}`).join(';'), points: row.points.map(p => ({ ...p, corner: false })) }
  const source = { kind: 'softAuto', generator: 'soft', shape: 'circle', diameter: +g.diameter, ratio: +g.ratio,
    horizontalFade: +g.hfade, verticalFade: +g.vfade, antialias: false, spikes: 2, randomness: 0, density: 1, softnessCurve } as const
  const coefficients = row.coefficients.map(c => [c[0], c[1], c[2], c[3]] as const)
  const owner = new CanonicalSoftCircleProgramOwner(cpu, { kind: 'auto', generator: 'soft', shape: 'circle', diameter: source.diameter, ratio: source.ratio, horizontalFade: source.horizontalFade, verticalFade: source.verticalFade, spikes: 2, softness: 1, randomness: 0, density: 1, antialias: false }, { points: row.points, coefficients }, row.values.length)
  while (!owner.done) owner.advance(64)
  const pin: CanonicalSoftAutoSource = { kind: 'softAuto', sourceSlot: 0, descriptorId: 'native-soft', descriptorVersion: 1, descriptorSha256: 'a'.repeat(64),
    source, brushScale: c.storedScale, brushAngle: c.storedAngle, coverageProfile: c.mode === 'scalar-common' ? 'scalar-f64-fma-v1' : 'neon64-f32-fma-v1',
    reader: 'krita-bd6e8d0-v1', compilerProfile: 'eigen-5.0.1-mapped-arm64-f64-v3', buildId: 'b'.repeat(64), radialCurve: { source: softnessCurve, coefficients } }
  const recipe: CanonicalSoftAutoRecipe = { kind: 'softAuto', sourceSlot: 0, source, coverageProfile: pin.coverageProfile,
    brushScale: c.storedScale, brushAngle: c.storedAngle, scale: c.shape.scale, ratio: c.shape.ratio, rotation: c.shape.rotation,
    subX: c.subpixelX, subY: c.subpixelY, width: c.width, height: c.height, mirrorH: false, mirrorV: false }
  const r: CanonicalAutoMaskRequest = { owner: {}, role: 'primary', material: { kind: 'canonicalAuto', recipe, trustedSource: pin, programOwner: owner },
    rect: { x: 0, y: 0, width: c.width, height: c.height }, profile: 'neon4-summed-wordsize64' }
  return { r, owner, pin }
}
it('uploads all40 native soft masks through existing bounded stripes and hits without borrowing', () => {
  const s = setup(); let total = 0
  try { for (const c of whole.cases) {
    const { r, owner } = request(s.cpu, c), captured = new Uint8Array(c.width * c.height), acquire = vi.spyOn(owner, 'acquire')
    s.gl.texSubImage2D.mockImplementation((...args: unknown[]) => {
      const y = args[3] as number, w = args[4] as number, h = args[5] as number, bytes = args[8] as Uint8Array
      for (let i = 0; i < w * h; i++) { expect([...bytes.subarray(i * 4, i * 4 + 4)]).toEqual([bytes[i * 4], bytes[i * 4], bytes[i * 4], bytes[i * 4]]); captured[y * w + i] = bytes[i * 4] }
    })
    const baseline = s.cpu.reservedBytes
    expect(s.service.beginAutoGeneration(r)).toBe(false)
    while (true) { const step = s.service.advanceAutoGeneration(64); expect(step.consumed).toBeLessThanOrEqual(64); if (step.done) break }
    expect(Buffer.from(captured).toString('base64')).toBe(c.coverageBase64)
    expect(s.cpu.reservedBytes).toBe(baseline)
    expect(s.service.beginAutoGeneration(r)).toBe(true); expect(acquire).toHaveBeenCalledTimes(1)
    s.service.releaseOwner(r.owner); owner.retire(); total += captured.length
  } expect(total).toBe(40864) }
  finally { s.service.reset(); s.cache.clear() }
  expect(s.cpu.reservedBytes).toBe(0)
})
it('retains a retired source during yielded work and balances cancellation and upload errors', () => {
  const s = setup()
  try { for (const fail of [false, true]) {
    const { r, owner } = request(s.cpu), baseline = s.cpu.reservedBytes - owner.estimatedCpuBytes
    s.service.beginAutoGeneration(r); s.service.advanceAutoGeneration(1); owner.retire()
    expect(s.cpu.reservedBytes).toBeGreaterThan(baseline + owner.estimatedCpuBytes)
    if (fail) { s.gl.texSubImage2D.mockImplementationOnce(() => { throw Error('upload primary') }); expect(() => { while (!s.service.advanceAutoGeneration(64).done) {} }).toThrow('upload primary') }
    else s.service.releaseOwner(r.owner)
    expect(s.cpu.reservedBytes).toBe(baseline)
  } } finally { s.service.reset(); s.cache.clear() }
  expect(s.cpu.reservedBytes).toBe(0)
})
it('includes full polynomial/build identity in revision and rejects a mismatched program before upload', () => {
  const s = setup(), { r, owner, pin } = request(s.cpu)
  try {
    const revision = canonicalAutoMaskRevision(r.material)
    const changed = { ...r.material, trustedSource: { ...pin, buildId: 'c'.repeat(64), radialCurve: { ...pin.radialCurve,
      coefficients: pin.radialCurve.coefficients.map((c, i) => i ? c : [c[0], c[1], c[2], c[3] + .01] as const) } } }
    expect(canonicalAutoMaskRevision(changed as typeof r.material)).not.toBe(revision)
    const baseline = s.cpu.reservedBytes
    expect(() => s.service.beginAutoGeneration({ ...r, material: changed } as CanonicalAutoMaskRequest)).toThrow('differs from trusted source')
    expect(s.cpu.reservedBytes).toBe(baseline); expect(s.gl.texSubImage2D).not.toHaveBeenCalled()
  } finally { owner.retire(); s.service.reset(); s.cache.clear() }
})
it('returns the soft borrow on stripe admission failure and preserves upload error through throwing release', () => {
  const s = setup(), { r, owner } = request(s.cpu), acquire = owner.acquire.bind(owner)
  const returned = vi.fn()
  vi.spyOn(owner, 'acquire').mockImplementation(() => {
    const lease = acquire()
    return { program: lease.program, release: () => { lease.release(); returned(); throw Error('lease notification') } }
  })
  try {
    const held = s.cpu.reserve(s.cpu.budgetBytes - s.cpu.reservedBytes)
    try { expect(() => s.service.beginAutoGeneration(r)).toThrow('budget') }
    finally { held() }
    expect(returned).toHaveBeenCalledTimes(1)
    s.service.beginAutoGeneration(r); owner.retire()
    s.gl.texSubImage2D.mockImplementationOnce(() => { throw Error('upload first') })
    expect(() => { while (!s.service.advanceAutoGeneration(64).done) {} }).toThrow('upload first')
    expect(returned).toHaveBeenCalledTimes(2)
    s.service.cancelAutoGeneration(); expect(returned).toHaveBeenCalledTimes(2)
    expect(s.cpu.reservedBytes).toBeGreaterThan(0)
  } finally { owner.retire(); s.service.reset(); s.cache.clear() }
  expect(s.cpu.reservedBytes).toBe(0)
})
it('clears matching completed slots even when cancelling another pending borrow throws', () => {
  const s = setup(2), { r, owner } = request(s.cpu), acquire = owner.acquire.bind(owner)
  try {
    s.service.beginAutoGeneration(r)
    while (!s.service.advanceAutoGeneration(64).done) {}
    vi.spyOn(owner, 'acquire').mockImplementation(() => {
      const lease = acquire()
      return { program: lease.program, release: () => { lease.release(); throw Error('cancel notification') } }
    })
    // A second role keeps the completed primary slot metadata until cancellation.
    s.service.beginAutoGeneration({ ...r, role: 'secondary' })
    expect(() => s.service.releaseOwner(r.owner)).toThrow('cancel notification')
    // Same primary must regenerate, proving owner metadata was cleared despite failure.
    expect(s.service.beginAutoGeneration(r)).toBe(false)
    expect(() => s.service.cancelAutoGeneration()).toThrow('cancel notification')
  } finally { owner.retire(); s.service.reset(); s.cache.clear() }
  expect(s.cpu.reservedBytes).toBe(0)
})
