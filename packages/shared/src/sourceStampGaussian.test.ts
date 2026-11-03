import { describe, expect, it } from 'vitest'
import stock from './fixtures/sourceDefaultAutoData/stock.native.js'
import gaussianStock from './fixtures/sourceGaussianAutoData/stock.native.js'
import { isBrushLibrary } from './brushes.js'
import { isSourceStampData, sourceStampSourceKind } from './sourceStampData.js'
import { extractCanonicalSinglePngCapability, extractDefaultAutoSourceDataCapability, extractGaussianAutoSourceDataCapability } from './canonicalBrushCapability.js'
import type { BrushDescriptor } from './brushes.js'

/** Schema isolation probes, not imported Gaussian originals or raster proof. */
function gaussianData() {
  const data = structuredClone(stock.rows[0].descriptor.sourceStamp)
  return { ...data, source: { ...data.source, kind: 'gaussianAuto', generator: 'gauss', shape: 'circle' } }
}
describe('Gaussian retained source identity', () => {
  it('preserves a third source kind without granting existing image/default executors', () => {
    const data = gaussianData()
    expect(isSourceStampData(data)).toBe(true)
    if (isSourceStampData(data)) expect(sourceStampSourceKind(data)).toBe('gaussianAuto')
    const descriptor = { ...stock.rows[0].descriptor, sourceStamp: data } as unknown as BrushDescriptor
    expect(extractDefaultAutoSourceDataCapability(descriptor)).toEqual({ supported: false, reasons: ['source-material-is-not-default-auto'] })
    expect(extractCanonicalSinglePngCapability(descriptor, { id: 'asset:' + 'a'.repeat(64), size: 64 })).toEqual({ supported: false, reasons: ['source-material-is-not-image'] })
  })
  it('separates data/compiler readiness from raster and tool permissions', () => {
    const descriptor = { ...stock.rows[0].descriptor, sourceStamp: gaussianData() } as unknown as BrushDescriptor
    const result = extractGaussianAutoSourceDataCapability(descriptor)
    expect(result.supported).toBe(true)
    if (result.supported) {
      expect(result.status).toBe('source-data-only')
      expect(result.rasterReady).toBe(false)
    }
    for (const patch of [{ spikes: 9 }, { randomness: .1 }, { density: .8 }, { ratio: 2 }]) {
      const d = structuredClone(descriptor)
      Object.assign(d.sourceStamp!.version === 2 ? d.sourceStamp!.source : {}, patch)
      if ('ratio' in patch) Object.assign(d.sourceStamp!.brush, { height: Math.trunc(Math.max(1, d.sourceStamp!.version === 2 && d.sourceStamp!.source.kind === 'gaussianAuto' ? d.sourceStamp!.source.diameter * patch.ratio! : 1)) })
      expect(extractGaussianAutoSourceDataCapability(d).supported).toBe(false)
    }
    const missing = { ...stock.rows[1].descriptor, sourceStamp: { ...gaussianData(), options: stock.rows[1].descriptor.sourceStamp.options, compiled: undefined } } as unknown as BrushDescriptor
    expect(extractGaussianAutoSourceDataCapability(missing).supported).toBe(false)
    expect(extractGaussianAutoSourceDataCapability(stock.rows[0].descriptor as unknown as BrushDescriptor).supported).toBe(false)
  })
  it('binds the generator, shape, version and source geometry strictly', () => {
    const d = gaussianData()
    const rectangle={...d,source:{...d.source,shape:'rect'}}
    expect(isSourceStampData(rectangle)).toBe(true)
    expect(extractGaussianAutoSourceDataCapability({...stock.rows[0].descriptor,sourceStamp:rectangle} as unknown as BrushDescriptor).supported).toBe(false)
    for (const source of [
      { ...d.source, generator: 'default' }, { ...d.source, shape: 'unknown-shape' },
      { ...d.source, kind: 'defaultAuto' }, { ...d.source, diameter: d.source.diameter + 10 },
      { ...d.source, ratio: 0 }, { ...d.source, horizontalFade: NaN },
      { ...d.source, coefficients: [] },
    ]) expect(isSourceStampData({ ...d, source })).toBe(false)
    expect(isSourceStampData({ ...d, version: 1 })).toBe(false)
    expect(isSourceStampData({ ...d, brush: { ...d.brush, scale: 2 } })).toBe(false)
    // Unsupported controls may be retained; schema acceptance is not execution.
    expect(isSourceStampData({ ...d, source: { ...d.source, spikes: 9, randomness: .1 } })).toBe(true)
  })
})


describe('actual imported Gaussian source data', () => {
  it('retains all13 original KPP sources and keeps unresolved material/dual consumers closed', () => {
    expect(gaussianStock.rows.map(r => r.index)).toEqual([2, 5, 6, 7, 10, 11, 12, 22, 38, 39, 40, 68, 70])
    const library = { schemaVersion: 1, assets: [], brushes: gaussianStock.rows.filter(r => r.descriptor.tip.kind === 'round').map(r => ({ descriptor: r.descriptor, name: r.name, source: r.name, warnings: [], compatibility: [] })), skipped: [] }
    // Bitmap descriptors still refer to their legacy CAS tips, which this raw
    // source fixture intentionally omits. Validate all13 source payloads below.
    expect(library.brushes).toHaveLength(9)
    expect(isBrushLibrary(library)).toBe(true)
    for (const row of gaussianStock.rows) {
      expect(row.kppSHA256).toMatch(/^[a-f0-9]{64}$/)
      expect(isSourceStampData(row.descriptor.sourceStamp)).toBe(true)
      const descriptor = row.descriptor as unknown as BrushDescriptor
      const result = extractGaussianAutoSourceDataCapability(descriptor)
      const ready = [2, 5, 6, 7, 10, 11, 22].includes(row.index)
      expect(result.supported, row.name).toBe(ready)
      if (!result.supported) expect(result.reasons).toEqual([
        [38, 39, 40].includes(row.index) ? 'mask-master-size-unresolved' : 'unsupported-gaussian-auto-material-consumer',
      ])
      if (result.supported) {
        expect(result.data.source.generator).toBe('gauss')
        expect(result.status).toBe('source-data-only')
        expect(result.rasterReady).toBe(false)
      }
      expect(extractDefaultAutoSourceDataCapability(descriptor).supported).toBe(false)
      expect(extractCanonicalSinglePngCapability(descriptor, { id: 'asset:' + 'a'.repeat(64), size: 64 }).supported).toBe(false)
      if (row.requiredCurves > 0) {
        const uncompiled = structuredClone(descriptor)
        Reflect.deleteProperty(uncompiled.sourceStamp!, 'compiled')
        expect(extractGaussianAutoSourceDataCapability(uncompiled).supported).toBe(false)
      }
    }
  })
})
