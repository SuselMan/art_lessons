import { describe, expect, it } from 'vitest'
import { TOGGLEABLE_TOOLS } from '@grafetto/shared'

import { FLOATING_TOOLS, TOOL_DISPLAY } from '../FloatingToolPanel/tools'

// (#548) The wire's list of toggleable tools and the client's list of tools a
// panel can show are two lists of the same fifteen things, maintained in two
// packages. They are allowed to be two lists — one is a contract, the other
// carries icons and grouping the server has no business knowing — but they are
// not allowed to disagree.
//
// A tool in one and not the other fails quietly in a way nobody would look
// for: a toolset that can switch off a tool the picker never shows, or a
// picker offering a tool the server drops on the way into the row.
describe('the toolset roster and the panel roster', () => {
  it('cover exactly the same tools, in the same order', () => {
    expect([...FLOATING_TOOLS]).toEqual([...TOGGLEABLE_TOOLS])
  })

  it('gives every toggleable tool an icon and a label', () => {
    for (const tool of TOGGLEABLE_TOOLS) {
      expect(TOOL_DISPLAY[tool]?.icon).toBeTruthy()
      expect(TOOL_DISPLAY[tool]?.labelKey).toBeTruthy()
    }
  })
})
