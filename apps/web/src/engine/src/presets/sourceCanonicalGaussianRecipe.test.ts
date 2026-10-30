import { expect, it } from 'vitest'
import { GAUSSIAN_READY_STOCK, sourceGaussianCanonicalFixture } from '../../testing/sourceGaussianCanonicalFixture'

it('transports all actual ready7 Gaussian programs at30pressure inputs through the same adapter/encoder in both profiles',()=>{
  let draws=0
  for(const index of GAUSSIAN_READY_STOCK)for(const profile of ['scalar-bionic-f64-fma-v1','neon64-f32-fma-v1'] as const) {
    const whole=sourceGaussianCanonicalFixture(index,profile,false),resumed=sourceGaussianCanonicalFixture(index,profile,true)
    expect(resumed).toEqual(whole)
    expect(whole.ended).toBe(true)
    expect(whole.state.inputOrdinal).toBe(30)
    expect(whole.context.assets).toEqual([])
    expect(whole.accepted.length).toBeGreaterThan(1)
    for(const accepted of whole.accepted) {
      expect(accepted.frame.definitions.every(d=>d.kind==='gaussianAuto'&&d.coverageProfile===profile)).toBe(true)
      draws+=accepted.frame.draws.length
    }
    expect(whole.accepted.at(-1)!.frame.fences.at(-1)?.kind==='gestureEnd').toBe(true)
  }
  expect(draws).toBe(220)
})
