import { expect, it } from 'vitest'
import { createTestEngine } from './testing/engineTestUtils'

it('versions compact field extent without letting a previous model change the next size', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  try {
    const field = (w: number, h: number, scale: number, compact: boolean | 'tight') => engine['_diffuseFieldFor'](w, h, scale, compact)
    const old = field(512, 512, 2, true)
    expect([old.w, old.h]).toEqual([768, 768])
    const tight = field(512, 512, 2, 'tight')
    expect([tight.w, tight.h]).toEqual([512, 512])
    expect(tight).not.toBe(old)
    const restoredOld = field(512, 512, 2, true)
    expect([restoredOld.w, restoredOld.h]).toEqual([768, 768])
    expect(restoredOld).not.toBe(tight)
    const large = field(800, 257, 2, 'tight')
    expect([large.w, large.h]).toEqual([1024, 512])
    expect([field(100, 100, 1, 'tight').w, field(100, 100, 1, true).h]).toEqual([1536, 1536])
  } finally { engine.destroy() }
})
