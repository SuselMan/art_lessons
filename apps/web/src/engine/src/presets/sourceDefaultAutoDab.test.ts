import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import native from './fixtures/sourceDefaultAutoWholePath/whole.native.json'
import { prepareSourceDefaultAutoDab, sourceDefaultAutoDab, type SourceDefaultAutoDabRequest } from './sourceDefaultAutoDab'
function request(index = 0): SourceDefaultAutoDabRequest {
  const row = native.cases[index]
  return { dialect: 'krita-default-auto-qt5-arm64-v1', tip: { kind: 'auto', generator: 'default',
    shape: row.generator.type === 'rect' ? 'rect' : 'circle', diameter: Number(row.generator.diameter), ratio: Number(row.generator.ratio),
    horizontalFade: Number(row.generator.hfade), verticalFade: Number(row.generator.vfade), antialias: row.generator.antialiasEdges !== '0',
    spikes: 2, softness: 1, randomness: 0, density: 1 }, storedScale: row.storedScale, storedAngle: row.storedAngle,
  shape: row.shape, subpixelX: row.subpixelX, subpixelY: row.subpixelY,
  coverageProfile: row.mode === 'scalar-common' ? 'scalar-f64-fma-v1' : 'neon64-f32-fma-v1', maxPixels: 16384, maxWorkSamples: 16384 * 36 }
}
describe('sourceDefaultAutoDab whole-wrapper coupling', () => {
  it('matches original native window, center, scale, routing and every A8 byte for all56 raw requests', () => {
    expect(native.cases).toHaveLength(56)
    let pixels = 0
    for (const [index, row] of native.cases.entries()) {
      const actual = sourceDefaultAutoDab(request(index))
      expect(actual.geometry.maskSize).toEqual([row.width, row.height])
      expect(actual.center).toEqual(row.processing.slice(2, 4))
      expect([Math.cos(actual.coverageAngle), Math.sin(actual.coverageAngle)]).toEqual(row.processing.slice(4))
      expect(actual.generatorScale).toEqual(row.generatorScale)
      expect(actual.route === 'neon64-vector').toBe(row.vectorBranch)
      expect(Buffer.from(actual.mask).toString('base64'), `${row.index}/${row.variant}/${row.mode}`).toBe(row.coverageBase64)
      pixels += actual.mask.length
    }
    expect(pixels).toBe(24590)
  })
  it('returns newly owned pixels and geometry without cross-call mutation', () => {
    const a = sourceDefaultAutoDab(request()), b = sourceDefaultAutoDab(request())
    const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
    const original = sha(b.mask)
    expect(a.mask).not.toBe(b.mask)
    expect(a.geometry).not.toBe(b.geometry)
    a.mask.fill(91)
    expect(sha(b.mask)).toBe(original)
    expect(sha(sourceDefaultAutoDab(request()).mask)).toBe(original)
  })
  it('preflights caller budget, hard plane/side bounds and unsupported profiles before A8 allocation', () => {
    const r = request()
    const oversized = { ...r, shape: { ...r.shape, scale: 5000 } }
    const narrowTall = { ...r, tip: { ...r.tip, diameter: 1, ratio: 5000 }, shape: { scale: 1, ratio: 1, rotation: 0 }, storedAngle: 0, storedScale: 1 }
    const cases = [{ ...r, maxPixels: 1 }, { ...r, maxWorkSamples: 1 }, { ...r, maxPixels: 1024 * 1024 + 1 }, oversized, narrowTall,
      { ...r, coverageProfile: 'automatic' }, { ...r, dialect: 'png' }, { ...r, subpixelX: -.1 },
      { ...r, tip: { ...r.tip, softness: .5 } }, { ...r, shape: { ...r.shape, scale: 0 } }]
    const allocation = vi.fn(() => { throw new Error('Unexpected A8 allocation') })
    vi.stubGlobal('Uint8Array', allocation)
    try { for (const invalid of cases) expect(() => sourceDefaultAutoDab(invalid as SourceDefaultAutoDabRequest)).toThrow(RangeError) }
    finally { vi.unstubAllGlobals() }
    expect(allocation).not.toHaveBeenCalled()
  })
})


it('keeps all56 independent native whole-wrapper bytes with partial samples and 13-byte stripes', () => {
  for (const [index,row] of native.cases.entries()) {
    const {evaluator,geometry}=prepareSourceDefaultAutoDab(request(index));
    expect(geometry.maskSize).toEqual([row.width,row.height]);
    const output:number[]=[];
    while(!evaluator.done){
      const stripe=new Uint8Array(13);let filled=0;
      while(filled<stripe.length&&!evaluator.done)filled+=evaluator.advance(stripe,filled,17).written;
      output.push(...stripe.subarray(0,filled));
    }
    expect(Buffer.from(output).toString('base64')).toBe(row.coverageBase64);
  }
});
