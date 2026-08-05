// (#400) Two properties matter here, and both are about a hold that outlives
// what set it: a stuck hold means the app never updates itself again, and a
// hold dropped too early means a room gets reloaded under the user.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { holdReload, isReloadUnsafe, onReloadSafe, resetReloadSafety } from './reloadSafety'

describe('reloadSafety (#400)', () => {
  beforeEach(resetReloadSafety)

  it('is safe until something says otherwise', () => {
    expect(isReloadUnsafe()).toBe(false)
  })

  it('stays unsafe until the last holder lets go', () => {
    const releaseA = holdReload()
    const releaseB = holdReload()
    releaseA()
    expect(isReloadUnsafe()).toBe(true)
    releaseB()
    expect(isReloadUnsafe()).toBe(false)
  })

  it('ignores a release called twice', () => {
    // StrictMode runs an effect's cleanup on a mount it then repeats, and a
    // double release would drive the count negative — after which the next
    // real hold would not register as one.
    const release = holdReload()
    release()
    release()
    holdReload()
    expect(isReloadUnsafe()).toBe(true)
  })

  it('announces only the edge back to safe', () => {
    const listener = vi.fn()
    onReloadSafe(listener)

    const release = holdReload()
    expect(listener).not.toHaveBeenCalled()
    release()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('survives a listener that unsubscribes itself while running', () => {
    const other = vi.fn()
    const unsubscribe = onReloadSafe(() => unsubscribe())
    onReloadSafe(other)

    holdReload()()
    expect(other).toHaveBeenCalledTimes(1)
  })
})
