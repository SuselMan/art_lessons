import { describe, it, expect } from 'vitest'

import {
  COMPACT_MAX_SHORT_SIDE_PX, compactMediaQuery, isCompactPreference, resolveCompact,
} from './deviceType'

describe('resolveCompact (#512)', () => {
  it('follows detection under auto', () => {
    expect(resolveCompact('auto', true)).toBe(true)
    expect(resolveCompact('auto', false)).toBe(false)
  })

  it('lets an explicit choice override detection in both directions', () => {
    // Both directions matter and for different people: `on` is for a big phone
    // detection reads as roomy, `off` is for someone who wants the full editor
    // on a small screen anyway. A preference that could only turn the shell on
    // would leave the second group stuck.
    expect(resolveCompact('on', false)).toBe(true)
    expect(resolveCompact('off', true)).toBe(false)
  })
})

describe('compactMediaQuery', () => {
  it('asks about both axes, so a rotated phone is still a phone', () => {
    // The short side is what decides, and which side that is changes with
    // orientation — so the query has to name both rather than just width.
    const query = compactMediaQuery()
    expect(query).toContain(`max-width: ${COMPACT_MAX_SHORT_SIDE_PX}px`)
    expect(query).toContain(`max-height: ${COMPACT_MAX_SHORT_SIDE_PX}px`)
  })

  it('joins the two axes with a comma, which is media-query OR', () => {
    // The distinction this pins down: a comma means "either side is small",
    // and `and` would mean "both sides are small" — true only of a square
    // screen, i.e. never. matchMedia does not throw on a wrong-but-valid
    // query, it just never matches, so the mistake would read as "no phone has
    // a small screen" rather than as an error.
    expect(compactMediaQuery()).toBe(
      `(max-width: ${COMPACT_MAX_SHORT_SIDE_PX}px), (max-height: ${COMPACT_MAX_SHORT_SIDE_PX}px)`)
  })
})

describe('isCompactPreference', () => {
  it('accepts the three states and rejects anything else', () => {
    expect(isCompactPreference('auto')).toBe(true)
    expect(isCompactPreference('on')).toBe(true)
    expect(isCompactPreference('off')).toBe(true)
    // What a localStorage read looks like before anyone has chosen, and what a
    // stale value from an older build would look like.
    expect(isCompactPreference(null)).toBe(false)
    expect(isCompactPreference('true')).toBe(false)
  })
})
