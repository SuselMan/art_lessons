import { describe, expect, it, vi } from 'vitest'
import { SmudgePainter } from './SmudgePainter'

/** Lifecycle-only fixtures: no GL context or vendor pixels. */
function fixture(strokeId: string | null = 'open') {
  const painter = Object.create(SmudgePainter.prototype) as SmudgePainter
  const buf = { marker: 'reservoir' }, destroy = vi.fn(), release = vi.fn()
  const secondary = { destroy }
  const imprints = new Map([['owner', { buf, strokeId }]])
  const wetGestures = new Map([['owner', { charge: .7, secondary }]])
  const previous = { x: 1, y: 2 }
  const replayChunks = new Map([['owner', { strokeId: 'open', lastDab: previous }]])
  Reflect.set(painter, 'imprints', imprints)
  Reflect.set(painter, 'wetGestures', wetGestures)
  Reflect.set(painter, 'replayChunks', replayChunks)
  Reflect.set(painter, 'scratchPool', { release })
  return { painter, buf, destroy, release, imprints, wetGestures, replayChunks, previous }
}

describe('SmudgePainter confirmed end lifecycle', () => {
  it('releases a completed matching owner exactly once', () => {
    const f = fixture()
    f.painter.finishGesture('owner', 'open')
    expect(f.release).toHaveBeenCalledExactlyOnceWith(f.buf)
    expect(f.destroy).toHaveBeenCalledTimes(1)
    expect(f.imprints.size + f.wetGestures.size + f.replayChunks.size).toBe(0)
    f.painter.finishGesture('owner', 'open')
    expect(f.release).toHaveBeenCalledTimes(1)
    expect(f.destroy).toHaveBeenCalledTimes(1)
  })

  it('ignores a delayed end for a different gesture or user', () => {
    const f = fixture()
    f.painter.finishGesture('owner', 'old')
    f.painter.finishGesture('another-user', 'open')
    f.painter.finishGesture('owner', null)
    expect(f.release).not.toHaveBeenCalled()
    expect(f.destroy).not.toHaveBeenCalled()
    expect(f.imprints.get('owner')?.buf).toBe(f.buf)
    expect(f.wetGestures.has('owner')).toBe(true)
    expect(f.replayChunks.has('owner')).toBe(true)
  })

  it('preserves another user while releasing the completed owner', () => {
    const f = fixture()
    const foreign = { buf: { marker: 'foreign' }, strokeId: 'foreign-stroke' }
    f.imprints.set('another-user', foreign)
    f.painter.finishGesture('owner', 'open')
    expect(f.imprints.get('another-user')).toBe(foreign)
    expect(f.release).toHaveBeenCalledExactlyOnceWith(f.buf)
  })

  it('keeps a continuing canonical chunk reservoir and resampling state', () => {
    const f = fixture()
    const resume = Reflect.get(f.painter, 'resumeGesture') as (user: string, stroke: string, dabs: unknown[]) => unknown
    expect(resume.call(f.painter, 'owner', 'open', [{ x: 3, y: 4 }])).toBe(f.previous)
    expect(f.release).not.toHaveBeenCalled()
    expect(f.destroy).not.toHaveBeenCalled()
    expect(f.imprints.get('owner')?.buf).toBe(f.buf)
    expect(f.wetGestures.get('owner')?.secondary).toBeDefined()
    expect(f.replayChunks.get('owner')?.strokeId).toBe('open')
  })

  it('matches synchronous local null ID without deleting another canonical resume key', () => {
    const f = fixture(null)
    f.painter.finishGesture('owner', null)
    expect(f.release).toHaveBeenCalledExactlyOnceWith(f.buf)
    expect(f.wetGestures.has('owner')).toBe(false)
    expect(f.replayChunks.get('owner')?.strokeId).toBe('open')
  })
})

it('keeps a peer gesture on another target when a layer is replayed',()=>{
 const f=fixture(),other={} as import('../buffers/ILayerBuffer').ILayerBuffer,target={} as import('../buffers/ILayerBuffer').ILayerBuffer
 Reflect.set(f.replayChunks.get('owner')!,'target',other)
 f.painter.dropReplayChunks({userId:'local',strokeId:null},target)
 expect(f.replayChunks.has('owner')).toBe(true)
 f.painter.dropReplayChunks({userId:'local',strokeId:null},other)
 expect(f.replayChunks.has('owner')).toBe(false)
})
it('restores live transient maps after a nested historical read throws',()=>{
 const f=fixture(),before=f.imprints.get('owner')
 expect(()=>f.painter.withIsolatedGestures(()=>{
  expect(f.imprints.size).toBe(0);f.imprints.set('temporary',{buf:{marker:'temp'},strokeId:'temp'});throw Error('read failed')
 })).toThrow('read failed')
 expect(f.imprints.get('owner')).toBe(before)
 expect(f.wetGestures.has('owner')).toBe(true)
 expect(f.replayChunks.get('owner')?.lastDab).toBe(f.previous)
 expect(f.release).toHaveBeenCalledWith({marker:'temp'})
 expect(f.release).not.toHaveBeenCalledWith(f.buf)
})
