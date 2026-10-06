import { describe, expect, it } from 'vitest'
import { permitsSnapshotWatermark } from './firstSnapshotPolicy.js'

describe('first snapshot uses actual committed per-layer coverage', () => {
  it('accepts the first layer in a 47-operation room at seq47', () => {
    expect(permitsSnapshotWatermark(47, 47, new Map(), ['paint'])).toBe(true)
  })
  it('does not round a113 picture down to100 or accept a future watermark', () => {
    expect(permitsSnapshotWatermark(113, 113, new Map(), ['paint'])).toBe(true)
    expect(permitsSnapshotWatermark(114, 113, new Map(), ['paint'])).toBe(false)
  })
  it('retains the existing periodic boundary contract', () => {
    expect(permitsSnapshotWatermark(200, 113, new Map(), ['paint'])).toBe(true)
    expect(permitsSnapshotWatermark(100, 113, new Map([['paint', 47]]), ['paint'])).toBe(true)
  })
  it('rejects a stale nonboundary bootstrap after a new peer operation', () => {
    expect(permitsSnapshotWatermark(47, 48, new Map(), ['paint'])).toBe(false)
  })
  it('allows partial coverage without confusing structure with every layer', () => {
    expect(permitsSnapshotWatermark(48, 48, new Map([['A', 47]]), ['B'])).toBe(true)
    expect(permitsSnapshotWatermark(48, 48, new Map([['A', 47]]), ['A', 'B'])).toBe(false)
  })
  it('allows concurrent duplicate first uploads at the same watermark', () => {
    expect(permitsSnapshotWatermark(47, 47, new Map([['A', 47]]), ['A', 'B'])).toBe(true)
  })
  it('does not turn bootstrap into snapshots on every subsequent operation', () => {
    expect(permitsSnapshotWatermark(48, 48, new Map([['paint', 47]]), ['paint'])).toBe(false)
  })
  it('rejects empty bootstrap uploads and invalid watermarks', () => {
    expect(permitsSnapshotWatermark(47, 47, new Map(), [])).toBe(false)
    for (const seq of [0, -1, 1.5, NaN, Infinity]) {
      expect(permitsSnapshotWatermark(seq, 47, new Map(), ['paint'])).toBe(false)
    }
  })
})
