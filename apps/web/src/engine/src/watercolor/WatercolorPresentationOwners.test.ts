import { describe, expect, it } from 'vitest'
import { WatercolorPresentationOwners } from './WatercolorPresentationOwners'
const view = { originX: 12, originY: 34, worldWidth: 2560, worldHeight: 1600 }
function fixture() {
  const allocations: unknown[] = [], releases: unknown[] = []
  const owners = new WatercolorPresentationOwners(64 * 1024 * 1024, 12,
    extent => { const material = { extent, marks: [] as number[] }; allocations.push(material); return material },
    (material, lost) => releases.push({ material, lost }))
  return { owners, allocations, releases }
}
describe('bounded watercolor material presentation owners', () => {
  it('eight water chunks followed by pigment reuse one allocation instead of exhausting four full canvas films', () => {
    const { owners, allocations } = fixture()
    for (let i = 0; i < 9; i++) {
      const owner = owners.acquire('paint', view)
      owners.hold(owner); owner.material.marks.push(i)
    }
    expect(allocations).toHaveLength(1)
    expect(owners.layers.get('paint')!.material.marks).toEqual([0,1,2,3,4,5,6,7,8])
    expect(owners.bytes).toBeLessThanOrEqual(64 * 1024 * 1024)
    expect(owners.layers.get('paint')!.extent).toMatchObject({ width: 1024, height: 640, ...view })
  })
  it('retirement preserves cumulative pixels until canonical solver and reveal handoff', () => {
    const { owners, releases } = fixture(), owner = owners.acquire('paint', view)
    const a = owners.hold(owner), b = owners.hold(owner)
    owner.material.marks.push(1, 2)
    owners.retire(owner, a)
    expect(owners.releaseReady(owner, true)).toBe(false)
    owners.retire(owner, b)
    expect(owners.releaseReady(owner, false)).toBe(false)
    expect(owner.material.marks).toEqual([1, 2])
    expect(releases).toEqual([])
    expect(owners.releaseReady(owner, true)).toBe(true)
    expect(releases).toHaveLength(1)
  })
  it('loss forgets owned resources exactly once and stale callbacks cannot release a replacement', () => {
    const { owners, releases } = fixture(), old = owners.acquire('paint', view)
    const key = owners.hold(old)
    owners.clear(true)
    const next = owners.acquire('paint', view)
    owners.hold(next)
    owners.retire(old, key)
    expect(owners.releaseReady(next, true)).toBe(false)
    owners.retire(next, [...next.pending][0])
    expect(owners.releaseReady(old, true)).toBe(false)
    expect(owners.layers.get('paint')).toBe(next)
    owners.cancelOwner(old, false)
    expect(owners.layers.get('paint')).toBe(next)
    expect(releases).toEqual([{ material: old.material, lost: true }])
    expect(() => owners.hold(old)).toThrow('Stale')
  })
  it('rejects nonfinite camera extents and requires explicit reprojection on camera change', () => {
    const { owners } = fixture()
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(() => owners.acquire('bad', { ...view, originX: value })).toThrow('Invalid')
      expect(() => owners.acquire('bad', { ...view, worldWidth: value })).toThrow('Invalid')
      expect(() => owners.acquire('bad', view, value)).toThrow('Invalid')
    }
    const owner = owners.acquire('paint', view)
    expect(() => owners.acquire('paint', { ...view, originX: 4000 })).toThrow('reprojection')
    expect(owners.layers.get('paint')).toBe(owner)
  })
  it('other layers retain their independent obligations when one owner is cancelled', () => {
    const { owners } = fixture()
    const a = owners.acquire('a', view), b = owners.acquire('b', view)
    owners.hold(a); owners.hold(b)
    owners.cancel('a', false)
    expect(owners.layers.get('b')).toBe(b)
    expect(b.pending.size).toBe(1)
    expect(owners.bytes).toBeLessThanOrEqual(64 * 1024 * 1024)
  })
})
