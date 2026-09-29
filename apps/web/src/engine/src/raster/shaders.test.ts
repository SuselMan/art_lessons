import { describe, expect, it } from 'vitest'

import {
  DAB_FRAG, DAB_VERT, RIBBON_FRAG, PAPER_COMPOSE_FRAG, WC_WATER_FRONT_FRAG, WC_FIELD_OP_FRAG, WC_FIELD_OP_HIGH_FRAG,
} from './shaders'
import { PIGMENT_DEPTH_SCALE } from '../watercolor/pigmentOptics'
import { WC_STANDING_GATE_LO, WC_STANDING_GATE_HI } from '../presets/watercolorPresets'

// (#536) One structural check on the GLSL, and it exists because this file is
// several *independent programs* that happen to live in one TypeScript module.
//
// GLSL ES 1.0 has no include, so every shader carries its own copy of whatever
// it needs — the noise family is emitted into two of them for exactly that
// reason (WC_NOISE_GLSL). The trap is that they read as one file: a constant
// declared next to its relatives in PAPER_COMPOSE_FRAG and *used* in DAB_FRAG
// looks perfectly reasonable at the editor, typechecks (it is all inside a
// template literal), passes every existing test, and then fails to compile at
// runtime — which takes the whole engine, and with it the whole page, down to a
// blank screen with nothing in the console. That is not a hypothetical; it cost
// a round of testing.
//
// Deliberately a text check rather than a GL one. MockGL never compiles
// anything, a real context is not available here, and the failure this catches
// is a scoping mistake that is visible in the source: a name used in a program
// that never declares it. See also .claude/rules.md on shader changes, and the
// ANGLE link failure with an empty log that is the same lesson one layer down.

const PROGRAMS: Array<[string, string]> = [
  ['WC_WATER_FRONT_FRAG', WC_WATER_FRONT_FRAG],
  ['WC_FIELD_OP_FRAG', WC_FIELD_OP_FRAG],
  ['WC_FIELD_OP_HIGH_FRAG', WC_FIELD_OP_HIGH_FRAG],
  ['DAB_VERT', DAB_VERT],
  ['DAB_FRAG', DAB_FRAG],
  ['RIBBON_FRAG', RIBBON_FRAG],
  ['PAPER_COMPOSE_FRAG', PAPER_COMPOSE_FRAG],
]

/** Strips line and block comments, so a constant merely *named* in a comment
 *  does not count as a use. Crude on purpose: GLSL has no strings, so there is
 *  nothing for a comment stripper to get wrong here. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

describe('every shader declares what it uses (#536)', () => {
  for (const [name, src] of PROGRAMS) {
    it(`${name} has no undeclared WC_ constant`, () => {
      const body = code(src)
      // A `#define`, with or without arguments, declares too: the helper
      // functions the linker choked on (see the ANGLE note) live as macros.
      const declared = new Set([
        ...[...body.matchAll(/\bconst\s+\w+\s+(WC_[A-Z0-9_]+)\s*=/g)].map(m => m[1]),
        ...[...body.matchAll(/#define\s+(WC_[A-Z0-9_]+)/g)].map(m => m[1]),
      ])
      const used = new Set([...body.matchAll(/\b(WC_[A-Z0-9_]+)\b/g)].map(m => m[1]))
      const missing = [...used].filter(u => !declared.has(u)).sort()
      expect(missing).toEqual([])
    })

    it(`${name} declares no WC_ constant twice`, () => {
      const names = [...code(src).matchAll(/\bconst\s+\w+\s+(WC_[A-Z0-9_]+)\s*=/g)].map(m => m[1])
      expect(names).toHaveLength(new Set(names).size)
    })
  }

  it('is actually looking at some constants', () => {
    // Guards the guard: a regex that silently stopped matching would make every
    // assertion above pass on an empty set forever.
    const declared = [...code(DAB_FRAG).matchAll(/\bconst\s+\w+\s+(WC_[A-Z0-9_]+)\s*=/g)]
    expect(declared.length).toBeGreaterThan(5)
  })

  it('scales the optical depth into eight bits by the number the oracle measured with (#536, §17.19)', () => {
    // The GLSL constant and the TypeScript one are two copies of one choice;
    // the quantisation study in pigmentOptics.test.ts is only about the shader
    // if they agree.
    const decl = `const float WC_DEPTH_SCALE = ${PIGMENT_DEPTH_SCALE.toFixed(1)};`
    expect(DAB_FRAG).toContain(decl)
    expect(RIBBON_FRAG).toContain(decl)
  })

  it('cuts the standing-water record where the live field cuts it (#536, §17.21)', () => {
    // watercolorStandingWater feeds the wetness field the composite draws
    // the puddle from; the two passes below write coverage .b, which the
    // diffusion runs in. Same edges, or the puddle you see and the puddle
    // the paint runs in are two different puddles.
    for (const frag of [RIBBON_FRAG, DAB_FRAG]) {
      expect(frag).toContain(`const float WC_STANDING_LO = ${WC_STANDING_GATE_LO.toFixed(2)};`)
      expect(frag).toContain(`const float WC_STANDING_HI = ${WC_STANDING_GATE_HI.toFixed(2)};`)
    }
    expect(RIBBON_FRAG).toContain('wcStandingGate(bandWater, u_washWater)')
    expect(DAB_FRAG).toContain('wcStandingGate(u_inkWater, u_washWater)')
  })
})
