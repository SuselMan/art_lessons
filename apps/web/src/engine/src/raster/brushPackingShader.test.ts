// Compiler fingerprints refreshed after shared procedural/texture shader integration.
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { WET_TRANSFER_FRAG } from './wetMixShaders'
import { BRUSH_STAMP_FRAG } from './brushBehaviorShaders'

const hash=(source:string)=>createHash('sha256').update(source).digest('hex')

it('keeps the unsupported-material wet program identical to source23',()=>{
  // 7f7b68a0 assembled WET_TRANSFER_FRAG, not merely its module text.
  expect(hash(WET_TRANSFER_FRAG)).toBe('8e2762ab38881dc6d04c06ef53cc4edf1c7723ea2be6b0962fe574f758c36de6')
  expect(WET_TRANSFER_FRAG).not.toContain('u_tipPacking')
})
it('pins the opt-in Gaussian stamp source independently of the unchanged wet source',()=>{
  // New source legitimately adds Gaussian dispatch; GPU equivalence is a separate gate.
  expect(hash(BRUSH_STAMP_FRAG)).toBe('95bef55d54ff18597f4e2951e46d5473094afcb28335fccb4ddd8005445baa8e')
})
