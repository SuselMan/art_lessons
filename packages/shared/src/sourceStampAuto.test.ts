import { describe, expect, it } from 'vitest'
import rawStock from './fixtures/sourceDefaultAutoData/stock.native.js'
import { isBrushLibrary, type BrushDescriptor } from './brushes.js'
import { isSourceStampData, sourceStampSourceKind, type SourceStampData, type SourceDefaultAutoData } from './sourceStampData.js'
import { extractCanonicalSinglePngCapability, extractDefaultAutoSourceDataCapability } from './canonicalBrushCapability.js'

type AutoDescriptor = BrushDescriptor & { readonly sourceStamp: SourceStampData & { readonly version: 2; readonly source: SourceDefaultAutoData } }
const stock = rawStock as unknown as { rows: { index: number; name: string; kppSHA256: string; requiredCurves: number; descriptor: AutoDescriptor }[] }

describe('typed source auto data at the production shared boundary', () => {
  it('validates all seven actual imported KPPs with compiled curves but never admits them as PNG or executable raster', () => {
    expect(stock.rows.map(r => r.index)).toEqual([4, 8, 17, 18, 19, 21, 67])
    expect(stock.rows.map(r => r.requiredCurves)).toEqual([0, 2, 2, 1, 0, 3, 4])
    const library = { schemaVersion: 1, assets: [], brushes: stock.rows.map(r => ({ descriptor: r.descriptor, name: r.name, source: r.name, warnings: [], compatibility: [] })), skipped: [] }
    expect(isBrushLibrary(library)).toBe(true)
    for (const row of stock.rows) {
      expect(row.kppSHA256).toMatch(/^[a-f0-9]{64}$/)
      expect(row.descriptor.id).toMatch(/^imported-[a-f0-9]{24}$/)
      expect(isSourceStampData(row.descriptor.sourceStamp)).toBe(true)
      const d = row.descriptor as BrushDescriptor
      const result = extractDefaultAutoSourceDataCapability(d)
      expect(result.supported, row.name).toBe(true)
      if (result.supported) { expect(result.status).toBe('source-data-only'); expect(result.rasterReady).toBe(false); expect(result.data.source.generator).toBe('default') }
      expect(extractCanonicalSinglePngCapability(d, { id: 'asset:' + 'a'.repeat(64), size: 64 })).toEqual({ supported: false, reasons: ['source-material-is-not-image'] })
    }
  })
  it('requires an explicit v2 kind; legacy missing kind can only mean image', () => {
    const auto = structuredClone(stock.rows[0].descriptor.sourceStamp)
    const legacy = { ...auto, version: 1, source: undefined }
    // Undefined own key is equivalent only at the legacy schema boundary, not
    // a route from actual auto data to PNG execution (tip remains procedural).
    expect(isSourceStampData(legacy)).toBe(true)
    if (isSourceStampData(legacy)) expect(sourceStampSourceKind(legacy)).toBe('image')
    expect(isSourceStampData({ ...auto, version: 1 })).toBe(false)
    expect(isSourceStampData({ ...auto, source: undefined })).toBe(false)
    expect(isSourceStampData({ ...auto, source: { ...auto.source, kind: 'gauss' } })).toBe(false)
    expect(isSourceStampData({ ...auto, source: { ...auto.source, diameter: 999 } })).toBe(false)
    expect(isSourceStampData({ ...auto, brush: { ...auto.brush, scale: 2 } })).toBe(false)
  })
  it('retains unsupported default controls but fails capability closed, and requires effective nonlinear programs', () => {
    for (const patch of [{ spikes: 9 }, { density: .8 }, { randomness: .1 }]) {
      const d = structuredClone(stock.rows[0].descriptor)
      Object.assign(d.sourceStamp.source, patch)
      expect(isSourceStampData(d.sourceStamp)).toBe(true)
      expect(extractDefaultAutoSourceDataCapability(d as BrushDescriptor).supported).toBe(false)
    }
    const uncompiled = structuredClone(stock.rows[1].descriptor)
    Reflect.deleteProperty(uncompiled.sourceStamp, 'compiled')
    expect(isSourceStampData(uncompiled.sourceStamp)).toBe(true)
    expect(extractDefaultAutoSourceDataCapability(uncompiled as BrushDescriptor).supported).toBe(false)
  })
})
