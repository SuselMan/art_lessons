import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../../stores/roomStore', () => ({ useRoomStore: {} }))
import { exposeMaterialReadinessForDev } from './devEngineHandle'
const ready = () => ({ owner: true, contentReady: true, snapshotReady: true, incomplete: false, latestKnownSeq: 5, ready: true })
afterEach(() => { globalThis.__roomMaterialReady = undefined; vi.unstubAllEnvs() })
describe('owned DEV material readiness handle', () => {
  it('is inert in production', () => {
    vi.stubEnv('DEV', false)
    const cleanup = exposeMaterialReadinessForDev(ready)
    expect(globalThis.__roomMaterialReady).toBeUndefined()
    cleanup()
  })
  it('reads current gate state and clears on owner cleanup', () => {
    vi.stubEnv('DEV', true)
    let state = ready()
    const cleanup = exposeMaterialReadinessForDev(() => state)
    expect(globalThis.__roomMaterialReady?.().ready).toBe(true)
    state = { ...state, snapshotReady: false, ready: false }
    expect(globalThis.__roomMaterialReady?.().ready).toBe(false)
    cleanup()
    expect(globalThis.__roomMaterialReady).toBeUndefined()
  })
  it('stale owner cleanup cannot erase successor probe', () => {
    vi.stubEnv('DEV', true)
    const cleanup = exposeMaterialReadinessForDev(ready)
    const newer = () => ({ ...ready(), latestKnownSeq: 8 })
    exposeMaterialReadinessForDev(newer)
    cleanup()
    expect(globalThis.__roomMaterialReady).toBe(newer)
  })
})
