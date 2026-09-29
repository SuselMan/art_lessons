import { describe, expect, it } from 'vitest'

import { TOOL_PHOTOS } from './toolTypeImages'

// The keys are cut out of glob paths by prefix length, so a move of this file
// that fixes the glob but not the prefix leaves every photo under a mangled
// key and the rail silently without pictures (#650 nearly shipped that).
describe('TOOL_PHOTOS', () => {
  it('is keyed by tool id', () => {
    expect(Object.keys(TOOL_PHOTOS)).toEqual(expect.arrayContaining(['pencil', 'charcoal', 'watercolor']))
  })
})
