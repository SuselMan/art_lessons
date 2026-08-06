import { describe, expect, it } from 'vitest'

import {
  rulerGestureAt, RULER_BODY_GRAB_PX, RULER_ENDPOINT_GRAB_PX, type RulerLineGeometry,
} from './rulerGesture'

// (#405) The rule that separates the ruler's two gestures — "dragging past the
// line always lays a new one" and "an existing line can only be grabbed while
// the ruler is selected" — is entirely this function, so this file is the
// readable statement of where each press lands.

const line: RulerLineGeometry = { a: { x: 100, y: 100 }, b: { x: 300, y: 100 } }
// Zoom 1, i.e. screen px and canvas px coincide — the caller divides by the
// zoom, which is tested on its own below.
const at = (x: number, y: number, l: RulerLineGeometry | null = line) =>
  rulerGestureAt({ x, y }, l, RULER_ENDPOINT_GRAB_PX, RULER_BODY_GRAB_PX)

describe('rulerGestureAt', () => {
  it('grabs the endpoint the press is on', () => {
    expect(at(100, 100)).toBe('a')
    expect(at(300, 100)).toBe('b')
  })

  it('slides the whole ruler from anywhere along its length', () => {
    expect(at(200, 100)).toBe('body')
    expect(at(200, 100 + RULER_BODY_GRAB_PX - 1)).toBe('body')
  })

  it('lays a new line everywhere else', () => {
    expect(at(200, 400)).toBe('new')
    expect(at(200, 100 + RULER_BODY_GRAB_PX + 1)).toBe('new')
  })

  // The whole point of the change: with the old two-surface arrangement the
  // catcher was removed as soon as a line existed, so a second line could
  // never be laid without first clearing the first one.
  it('lays a new line over an existing one rather than refusing', () => {
    expect(at(500, 500)).toBe('new')
  })

  // Endpoints win where the two targets overlap — the body is reachable
  // everywhere else along the line, an endpoint only here.
  it('prefers the endpoint to the body where both are in reach', () => {
    expect(at(100 + RULER_BODY_GRAB_PX / 2, 100)).toBe('a')
  })

  it('picks the nearer endpoint when both are in reach', () => {
    const collapsed: RulerLineGeometry = { a: { x: 100, y: 100 }, b: { x: 104, y: 100 } }
    expect(at(99, 100, collapsed)).toBe('a')
    expect(at(105, 100, collapsed)).toBe('b')
  })

  // The band is around the *segment*, not the infinite line it lies on:
  // snapping extends past the endpoints (rulerSnap.ts guides a stroke), but
  // grabbing must not, or a whole screen-wide strip would be un-startable.
  it('does not extend the grab band past the ends of the segment', () => {
    expect(at(320, 100)).toBe('new')
    expect(at(-500, 100)).toBe('new')
  })

  // A hidden ruler is inert: Room passes null for it rather than adding a
  // second condition here, and null is unambiguously "there is nothing to
  // take hold of".
  it('treats a missing line as nothing to grab', () => {
    expect(at(100, 100, null)).toBe('new')
  })

  it('handles a degenerate line without dividing by zero', () => {
    const dot: RulerLineGeometry = { a: { x: 50, y: 50 }, b: { x: 50, y: 50 } }
    expect(at(50, 50, dot)).toBe('a')
    expect(at(500, 500, dot)).toBe('new')
  })

  // Tolerances are screen px divided by the zoom at the call site, so a ruler
  // is exactly as easy to grab zoomed out as zoomed in — the same rule that
  // keeps the transform gizmo's handles a fixed screen size (#394).
  it('keeps the grab area a constant size on screen at any zoom', () => {
    const zoom = 4
    const justInside = RULER_BODY_GRAB_PX / zoom * 0.9
    const justOutside = RULER_BODY_GRAB_PX / zoom * 1.1
    const gesture = (dy: number) => rulerGestureAt(
      { x: 200, y: 100 + dy }, line,
      RULER_ENDPOINT_GRAB_PX / zoom, RULER_BODY_GRAB_PX / zoom,
    )
    expect(gesture(justInside)).toBe('body')
    expect(gesture(justOutside)).toBe('new')
  })
})
