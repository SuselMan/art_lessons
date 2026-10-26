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
it('keeps the validated packed stamp program unchanged when isolating its sampler',()=>{
  expect(hash(BRUSH_STAMP_FRAG)).toBe('0ed07decbfe453a7ab131ae93dae50af025d316e81d864e1edb1107cc332022f')
})
