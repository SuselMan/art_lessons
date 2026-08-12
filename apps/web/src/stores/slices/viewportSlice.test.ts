import { describe, expect, it, beforeEach } from 'vitest'

import { useRoomStore, resetRoomStore } from '../roomStore'
import { isHandActive } from './viewportSlice'

// #319/#443: the hand is reachable two ways at once — selected from the toolbar
// (or its hotkey), which since #443 means `tool` like any other tool, and held
// on Space, which is still a flag of its own here. These cover the part that
// isn't obvious: what happens when both are in play at the same time.
// resetRoomStore() is the store's own test-isolation mechanism (see its doc
// comment in roomStore.ts).
describe('hand (#319, #443)', () => {
  beforeEach(() => { resetRoomStore() })

  it('starts off', () => {
    expect(isHandActive(useRoomStore.getState())).toBe(false)
  })

  it('turns on from either route on its own', () => {
    useRoomStore.getState().setTool('hand')
    expect(isHandActive(useRoomStore.getState())).toBe(true)

    resetRoomStore()
    useRoomStore.getState().setHandHeld(true)
    expect(isHandActive(useRoomStore.getState())).toBe(true)
  })

  it('keeps the selected hand when Space is released over it', () => {
    // The reason the hold is still a separate flag rather than a value of
    // `tool`. Someone who picked the hand from the toolbar and then happened to
    // tap Space must not be dropped back into a pencil they didn't ask for.
    useRoomStore.getState().setTool('hand')
    useRoomStore.getState().setHandHeld(true)
    useRoomStore.getState().setHandHeld(false)

    expect(useRoomStore.getState().tool).toBe('hand')
    expect(isHandActive(useRoomStore.getState())).toBe(true)
  })

  it('gives Space back the tool it was held over', () => {
    // The other half of the same guarantee, the direction that made the hold a
    // hold: a drawing tool stays selected underneath it, so the release is a
    // return rather than a switch.
    useRoomStore.getState().setTool('charcoal')
    useRoomStore.getState().setHandHeld(true)
    expect(isHandActive(useRoomStore.getState())).toBe(true)
    expect(useRoomStore.getState().tool).toBe('charcoal')

    useRoomStore.getState().setHandHeld(false)
    expect(isHandActive(useRoomStore.getState())).toBe(false)
    expect(useRoomStore.getState().tool).toBe('charcoal')
  })

  it('drops the mode when Space is released and nothing else holds it', () => {
    useRoomStore.getState().setHandHeld(true)
    useRoomStore.getState().setHandHeld(false)
    expect(isHandActive(useRoomStore.getState())).toBe(false)
  })

  it('is wiped by resetRoomStore, like the rest of the room state', () => {
    // Room resets the store on every mount — a hand left selected in one room
    // must not open the next one in a mode nobody picked.
    useRoomStore.getState().setTool('hand')
    useRoomStore.getState().setHandHeld(true)
    resetRoomStore()
    expect(isHandActive(useRoomStore.getState())).toBe(false)
  })
})
