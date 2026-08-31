import { describe, expect, it } from 'vitest'

import { pastePlacement } from './pastePlacement'

const COPIED = { roomId: 'room-a', x: 400, y: 900, width: 200, height: 100 }

describe('pastePlacement (#521)', () => {
  it('pastes in place inside the room it was copied from', () => {
    // ADR 008's rule, and the one this must not break: within a room, paste
    // lands exactly where it was cut from, which is what lines a copy up with
    // its original on the layer below.
    const at = pastePlacement(COPIED, 'room-a', { x: 0, y: 0 })
    expect(at).toEqual({ x: 400, y: 900 })
  })

  it('ignores the view entirely when the room matches', () => {
    // Even with the camera parked somewhere else — scrolling away must not
    // move where a same-room paste lands.
    const at = pastePlacement(COPIED, 'room-a', { x: 12345, y: -6789 })
    expect(at).toEqual({ x: 400, y: 900 })
  })

  it('centres on the view when it came from another room', () => {
    const at = pastePlacement(COPIED, 'room-b', { x: 1000, y: 500 })
    // The rect keeps its natural size, so its centre is the view centre.
    expect(at).toEqual({ x: 1000 - 100, y: 500 - 50 })
  })

  it('lands the piece on screen even when the source coordinates are far away', () => {
    // The case that motivated the rule: a piece copied from the far corner of
    // a big sheet, pasted into a small one. In place would put it outside the
    // new sheet, invisible and with its gizmo off-screen too.
    const fromFarAway = { roomId: 'a2-room', x: 3800, y: 5000, width: 300, height: 300 }
    const at = pastePlacement(fromFarAway, 'a5-room', { x: 210, y: 297 })
    expect(at).toEqual({ x: 60, y: 147 })
  })

  it('falls back to the copied coordinates when the view cannot be measured', () => {
    // A poor answer in another room, but a real place — the alternative is
    // pasting at NaN.
    expect(pastePlacement(COPIED, 'room-b', null)).toEqual({ x: 400, y: 900 })
  })

  it('centres when the current room is unknown', () => {
    // No room id means nothing can be shown to be in place, and centring is
    // the answer that is always visible.
    expect(pastePlacement(COPIED, undefined, { x: 0, y: 0 })).toEqual({ x: -100, y: -50 })
  })
})
