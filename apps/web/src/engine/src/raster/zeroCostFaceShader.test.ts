import { describe, expect, it } from 'vitest'
import { WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_FRAG, WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_COLOUR_FRAG, WC_FIELD_OP_CARRY_FRAG, WC_FIELD_OP_CARRY_COLOUR_FRAG, WC_FIELD_OP_ZERO_FACE_CARRY_FRAG, WC_FIELD_OP_ZERO_FACE_CARRY_COLOUR_FRAG } from './shaders'

describe('independent zero face diagnostic shader', () => {
  it('keeps the original programs and changes exactly one reciprocal face branch', () => {
    const marker = '          if (ci <= 1e-5 && cj <= 1e-5) capIJ *= ws[k] / pow(4.0, u_size.x);'
    expect(WC_FIELD_OP_CARRY_FRAG.split(marker)).toHaveLength(2)
    expect(WC_FIELD_OP_CARRY_FRAG).not.toContain('u_k * 0.25 * phase')
    expect(WC_FIELD_OP_CARRY_COLOUR_FRAG).toBe(`#define FIELD_OP_COLOUR\n${WC_FIELD_OP_CARRY_FRAG}`)
    const [before, after] = WC_FIELD_OP_CARRY_FRAG.split(marker)
    expect(WC_FIELD_OP_ZERO_FACE_CARRY_FRAG.startsWith(before)).toBe(true)
    expect(WC_FIELD_OP_ZERO_FACE_CARRY_FRAG.endsWith(marker + after)).toBe(true)
    expect(WC_FIELD_OP_ZERO_FACE_CARRY_COLOUR_FRAG).toBe(`#define FIELD_OP_COLOUR\n${WC_FIELD_OP_ZERO_FACE_CARRY_FRAG}`)
  })
  it('uses the same phase and donor fraction for both carried records without new sampler inputs', () => {
    const uniforms = (src: string) => [...src.matchAll(/uniform\s+\w+\s+(\w+)/g)].map(m => m[1])
    expect(uniforms(WC_FIELD_OP_ZERO_FACE_CARRY_FRAG)).toEqual(uniforms(WC_FIELD_OP_CARRY_FRAG))
    expect(WC_FIELD_OP_ZERO_FACE_CARRY_FRAG).toContain('float phase = ws[k] / pow(4.0, u_size.x);')
    expect(WC_FIELD_OP_ZERO_FACE_CARRY_FRAG).toContain('out4 -= a * (give / max(m.a, 5e-5));')
    expect(WC_FIELD_OP_ZERO_FACE_CARRY_FRAG).toContain('out4 += aj * (take / max(mj.a, 5e-5));')
  })
})

it('ADD contains the entire literal legacy shader with only one inserted block', () => {
  const marker='          if (ci <= 1e-5 && cj <= 1e-5) capIJ *= ws[k] / pow(4.0, u_size.x);'
  const [before,after]=WC_FIELD_OP_CARRY_FRAG.split(marker)
  expect(WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_FRAG.startsWith(before)).toBe(true)
  expect(WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_FRAG.endsWith(marker+after)).toBe(true)
  const inserted=WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_FRAG.slice(before.length,-(marker+after).length)
  expect(inserted).not.toContain('continue;')
  expect(inserted).not.toContain('capIJ *=')
  expect(inserted).not.toContain('sumI')
  expect(WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_COLOUR_FRAG).toBe(`#define FIELD_OP_COLOUR\n${WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_FRAG}`)
})
