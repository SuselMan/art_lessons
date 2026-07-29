import { describe, expect, it, beforeEach } from 'vitest'

import { useRoomStore, resetRoomStore } from '../roomStore'

// #309: what makes this slice worth a test isn't the boolean — it's that the
// only consumer that reaches the DOM does so through `useRoomStore.subscribe`,
// which fires per `set()` call and not per changed value. The subscription in
// Room therefore has to compare against `prevState` itself, and these cover
// the two things that contract rests on: the flag really does land in the
// store, and it is not left hanging across room mounts. resetRoomStore() is
// the store's own test-isolation mechanism (see its doc comment in
// roomStore.ts).
describe('strokeActive (#94/#309)', () => {
  beforeEach(() => { resetRoomStore() })

  it('starts off', () => {
    expect(useRoomStore.getState().strokeActive).toBe(false)
  })

  it('follows the engine\'s strokeStart/strokeEnd pair', () => {
    useRoomStore.getState().setStrokeActive(true)
    expect(useRoomStore.getState().strokeActive).toBe(true)

    useRoomStore.getState().setStrokeActive(false)
    expect(useRoomStore.getState().strokeActive).toBe(false)
  })

  it('notifies subscribers with a previous state they can compare against', () => {
    // Room's projection effect drops every notification where strokeActive is
    // unchanged — including the ones triggered by unrelated writes elsewhere
    // in the store, which is most of them. If prevState ever stopped carrying
    // the old value, that filter would silently invert into "write the
    // attribute on every store update".
    const seen: Array<[boolean, boolean]> = []
    const unsubscribe = useRoomStore.subscribe((s, p) => { seen.push([p.strokeActive, s.strokeActive]) })

    useRoomStore.getState().setStrokeActive(true)
    useRoomStore.getState().setTool('eraser')
    useRoomStore.getState().setStrokeActive(false)
    unsubscribe()

    expect(seen).toEqual([[false, true], [true, true], [true, false]])
  })

  it('is wiped by resetRoomStore, like the rest of the room state', () => {
    // Room unmounting mid-stroke (leaving the room while the pen is down) is
    // the real case: the next room must not open with its chrome already
    // blocked by a stroke that ended in a different room.
    useRoomStore.getState().setStrokeActive(true)
    resetRoomStore()
    expect(useRoomStore.getState().strokeActive).toBe(false)
  })
})
