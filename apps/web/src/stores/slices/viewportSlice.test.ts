import { describe, expect, it, beforeEach } from 'vitest'

import { useRoomStore, resetRoomStore } from '../roomStore'
import { isHandActive } from './viewportSlice'

// #319: the hand tool is reachable two ways at once — chosen from the toolbar
// (or its hotkey), and held on Space — so the mode is two flags rather than
// one. These cover the part that isn't obvious: what happens when both are
// in play at the same time. resetRoomStore() is the store's own test-isolation
// mechanism (see its doc comment in roomStore.ts).
describe('hand tool (#319)', () => {
  beforeEach(() => { resetRoomStore() })

  it('starts off', () => {
    expect(isHandActive(useRoomStore.getState())).toBe(false)
  })

  it('turns on from either route on its own', () => {
    useRoomStore.getState().setHandTool(true)
    expect(isHandActive(useRoomStore.getState())).toBe(true)

    resetRoomStore()
    useRoomStore.getState().setHandHeld(true)
    expect(isHandActive(useRoomStore.getState())).toBe(true)
  })

  it('keeps the chosen tool when Space is released over it', () => {
    // The reason there are two flags. Someone who picked the hand from the
    // toolbar and then happened to tap Space must not be dropped back into a
    // pencil they didn't ask for.
    useRoomStore.getState().setHandTool(true)
    useRoomStore.getState().setHandHeld(true)
    useRoomStore.getState().setHandHeld(false)

    expect(useRoomStore.getState().handTool).toBe(true)
    expect(isHandActive(useRoomStore.getState())).toBe(true)
  })

  it('drops the mode when Space is released and nothing else holds it', () => {
    useRoomStore.getState().setHandHeld(true)
    useRoomStore.getState().setHandHeld(false)
    expect(isHandActive(useRoomStore.getState())).toBe(false)
  })

  it('is wiped by resetRoomStore, like the rest of the room state', () => {
    // Room resets the store on every mount — a hand tool left on in one room
    // must not open the next one in a mode nobody selected.
    useRoomStore.getState().setHandTool(true)
    useRoomStore.getState().setHandHeld(true)
    resetRoomStore()
    expect(isHandActive(useRoomStore.getState())).toBe(false)
  })
})
