// #489: shapingForTool entered through dabShaping.ts, with no angle config.
//
// This is the path the brush cursor takes before any tool setting has been
// pushed, and it is where a temporal dead zone shipped: watercolorPresets.ts
// read `DEFAULT_NIB_ANCHOR` — a `const` — across its import cycle with
// dabShaping.ts, which throws whenever dabShaping is the module entered first.
// The whole suite stayed green and the first real page load threw.
//
// Two things worth writing down, because the second one cost the first one's
// credibility. The file does exercise the default-angle branch, which is worth
// having. It does **not** reproduce the failure: put the `const` back and this
// still passes, because Vitest's SSR transform resolves the cycle in a
// different order than the browser's native ESM does. Measured, not assumed.
//
// So the guard against that class of bug is loading the page, not this file.
// The rule that prevents it in the first place is in watercolorPresets.ts's own
// header, and now in the comment on watercolorDefaultNibAngle.
import { shapingForTool } from './dabShaping'

import { describe, expect, it } from 'vitest'

describe('#489 shapingForTool with no angle config', () => {
  it('builds a watercolor chisel at the shared 45deg default', () => {
    const shaping = shapingForTool('watercolor', 'normal:60:40:PB29:chisel')
    expect(shaping.angle(0, 0, 0, 0, 0)).toBeCloseTo(Math.PI / 4, 9)
    expect(shaping.aspect(0, 0.5)).toBeGreaterThan(1)
  })

  it('and every tool builds without one', () => {
    for (const tool of ['pencil', 'marker', 'brushPen', 'watercolor', 'charcoal', 'liner'] as const) {
      expect(() => shapingForTool(tool, undefined)).not.toThrow()
    }
  })
})
