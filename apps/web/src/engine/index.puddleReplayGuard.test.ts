import { expect, it, vi } from 'vitest'
import type { PuddleRoomHost } from './src/watercolor/puddle/PuddleRoomController'
import { createTestEngine } from './testing/engineTestUtils'

const capture = vi.hoisted(() => ({ host: undefined as PuddleRoomHost | undefined }))
vi.mock('./src/watercolor/puddle/PuddleRoomController', () => ({
  PuddleRoomController: class {
    constructor(host: PuddleRoomHost) { capture.host = host }
    presentAll() {}
  },
}))

it('pauses automatic puddle work for sliced rebuilds and resumes after the last one', () => {
  const { engine } = createTestEngine({}, { width: 16, height: 16 })
  const internals = engine as unknown as {
    _puddle: unknown
    _puddleFor(): unknown
    _strokeLayerId: string | null
    _rebuildJobs: Map<string, unknown>
    _pendingRebuilds: Set<string>
  }
  internals._puddleFor()
  expect(capture.host!.drawing()).toBe(false)
  internals._rebuildJobs.set('a', {})
  internals._rebuildJobs.set('b', {})
  expect(capture.host!.drawing()).toBe(true)
  internals._rebuildJobs.delete('a')
  expect(capture.host!.drawing()).toBe(true)
  internals._rebuildJobs.delete('b')
  // A deferred job can wait for Dry itself; it must not block the controller.
  internals._pendingRebuilds.add('pending')
  expect(capture.host!.drawing()).toBe(false)
  internals._strokeLayerId = 'drawing'
  expect(capture.host!.drawing()).toBe(true)
  internals._strokeLayerId = null
  internals._pendingRebuilds.clear()
  internals._puddle = null
})
