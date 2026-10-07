import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { CanonicalWatercolorSettlePlan } from './CanonicalWatercolorSettlePlan'
import { traceFixture } from './CanonicalWatercolorSettlePlan.fixture'
import baseline from './CanonicalWatercolorSettlePlan.trace.json'

describe('backend-independent canonical plan preserves frozen GL operation chronology', () => {
  for (const test of baseline.cases) {
    it(`full=${!test.half},mixed=${test.mixed},film=${test.film},abort=${test.abort}`, () => {
      const f = traceFixture(test.half, test.mixed, test.film, true, true)
      // This backend has no GL context, fbo, texture name or framebuffer API.
      const builder = new CanonicalWatercolorSettlePlan(f.context)
      const plan = builder.prepare(f.scratch, [{ buffer: f.tile, originX: 0, originY: 0, contentRect: null }],
        { minX: f.width / 2 - 12, minY: f.width / 2 - 12, maxX: f.width / 2 + 12, maxY: f.width / 2 + 12 },
        .2, test.half ? 400 : 8, 1, 1, 1, 1, 0, (...args) => f.record('preview', args))!
      expect(plan).not.toBeNull()
      f.record('domain', [plan.compositeDomain])
      if (test.abort) plan.ops[0]()
      else { for (const op of plan.ops) op(); plan.finish() }
      plan.dispose(); plan.dispose(); builder.destroyTextures()
      const counts: Record<string, number> = {}
      for (const event of f.events) counts[event[0] as string] = (counts[event[0] as string] ?? 0) + 1
      expect(f.events.length).toBe(test.count)
      expect(counts).toEqual(test.counts)
      expect(createHash('sha256').update(JSON.stringify(f.events)).digest('hex')).toBe(test.hash)
      expect(counts.uploadForeign).toBe(1)
      expect(counts.uploadFlow).toBeGreaterThan(0)
      if (!test.abort) {
        expect(counts.brush).toBeGreaterThan(0)
        expect(counts.front).toBeGreaterThan(0)
        expect(counts.diffuse).toBeGreaterThan(0)
        if (test.half) expect(counts.resample).toBeGreaterThan(0)
      }
    })
  }
})
