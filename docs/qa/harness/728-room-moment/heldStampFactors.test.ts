import { describe, expect, it } from 'vitest'
import { CANONICAL_STAMP_WGSL } from '../../../../apps/web/src/engine/src/webgpuCanonical/stamp'
import { ACTUAL_FIRST_PURPLE_STAMP, heldStampFactorShader } from './heldStampFactors'

describe('actual held stamp diagnostic substitutions', () => {
  it('preserves the entire geometry and noise prefix for every arm', () => {
    const prefix = CANONICAL_STAMP_WGSL.slice(0, CANONICAL_STAMP_WGSL.indexOf('var o:InkOut;'))
    for (const group of ['amount','contact','modulation'] as const) {
      expect(heldStampFactorShader(group).startsWith(prefix)).toBe(true)
    }
  })
  it('baseline amount is the literal production pigment expression', () => {
    expect(heldStampFactorShader('amount')).toContain('o.pigment=vec4f(amount*u.paint.x,amount*wet,amount*u.paint.z,amount)')
    expect(heldStampFactorShader('amount')).toContain('amount*=wcTipContact')
  })
  it('counterfactual changes only the paint contact multiplier before the output', () => {
    const a = heldStampFactorShader('amount')
    const b = heldStampFactorShader('no-tip-counterfactual')
    expect(b).toBe(a.replace('amount*=wcTipContact(a,u.combs,world,wcTipPressure(u.contact.z,u.pose.z));','amount*=1.0; // diagnostic counterfactual: tipContact only'))
    expect(b).toContain('cov*=wcTipContact') // coverage function untouched
  })
  it('captured first stamp has no bristle/blot confounder or geometry retuning', () => {
    expect(ACTUAL_FIRST_PURPLE_STAMP.uniforms.bristleInk).toBe(0)
    expect(ACTUAL_FIRST_PURPLE_STAMP.pigmentPool).toBe(0)
    expect(ACTUAL_FIRST_PURPLE_STAMP.radius).toBe(119.43336486816406)
    expect(ACTUAL_FIRST_PURPLE_STAMP.center).toEqual([350.0000305175781,400.00006103515625])
  })
})
