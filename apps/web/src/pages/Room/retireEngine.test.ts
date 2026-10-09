import { expect, it, vi } from 'vitest'
import type { PencilEngineAPI } from '../../engine'
import { retireEngine } from './engineWiring'
import { createSnapshotGate } from './net/snapshotGate'
const upload = vi.hoisted(() => vi.fn(async () => false))
vi.mock('./net/snapshotSync', () => ({ uploadThumbnail: upload }))
const flush = async () => { await new Promise<void>(resolve => setImmediate(resolve)) }
it('unready StrictMode cleanup cannot publish, always releases and destroys', () => {
  upload.mockClear(); const destroy = vi.fn(), release = vi.fn()
  retireEngine({ destroy } as unknown as PencilEngineAPI, 'own-room', { current: false }, release)
  expect(upload).not.toHaveBeenCalled(); expect(release).toHaveBeenCalledOnce(); expect(destroy).toHaveBeenCalledOnce()
})
it('completed owned material exit publishes once and destroys after upload', async () => {
  upload.mockClear(); const destroy = vi.fn(), release = vi.fn()
  retireEngine({ destroy } as unknown as PencilEngineAPI, 'own-room', { current: false }, release, true)
  expect(upload).toHaveBeenCalledOnce(); await flush(); expect(destroy).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledOnce()
})
it('stale engine cannot borrow replacement readiness or clear its reference', () => {
  upload.mockClear(); const old = { destroy: vi.fn() }, current = { destroy: vi.fn() }, engineRef = { current }
  const oldGate = createSnapshotGate(), replacementGate = createSnapshotGate(); replacementGate.restoreCompleted(12)
  const materialPublishable = (engineRef.current as unknown) === old && true && oldGate.ready()
  if ((engineRef.current as unknown) === old) engineRef.current = null as never
  retireEngine(old as unknown as PencilEngineAPI, 'own-room', { current: false }, undefined, materialPublishable)
  expect(upload).not.toHaveBeenCalled(); expect(engineRef.current).toBe(current); expect(old.destroy).toHaveBeenCalledOnce()
})
it('failed or incomplete material cannot publish when UI was unblocked', () => {
  for (const incomplete of [false, true]) {
    upload.mockClear(); const destroy = vi.fn(), gate = createSnapshotGate()
    if (incomplete) gate.restoreCompleted(12)
    retireEngine({ destroy } as unknown as PencilEngineAPI, 'own-room', { current: incomplete }, undefined, gate.ready())
    expect(upload).not.toHaveBeenCalled(); expect(destroy).toHaveBeenCalledOnce()
  }
})
