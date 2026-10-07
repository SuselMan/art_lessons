import { it, expect } from 'vitest'
import { WC_FIELD_OP_CARRY_FRAG, WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_FRAG, WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_COLOUR_FRAG } from './shaders'
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
