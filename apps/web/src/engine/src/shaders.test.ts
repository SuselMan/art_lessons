import { describe, expect, it } from 'vitest'

import {
  DAB_FRAG, DAB_VERT, RIBBON_FRAG, PAPER_COMPOSE_FRAG,
} from './shaders'

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
      const declared = new Set(
        [...body.matchAll(/\bconst\s+\w+\s+(WC_[A-Z0-9_]+)\s*=/g)].map(m => m[1]),
      )
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
})
