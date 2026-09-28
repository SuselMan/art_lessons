import { describe, expect, it } from 'vitest'

import { keyOwner, editorOwnsKey, type KeyContext } from './editorKeys'

// (#405) Esc and Enter close a transform session, and both keys were already
// spoken for by four other layers of the UI. The ordering below is the answer,
// and this file is where it is legible.

const nothingOpen: KeyContext = {
  defaultPrevented: false,
  modalOpen: false,
  typing: false,
  popoverOpen: false,
}
const at = (over: Partial<KeyContext>) => keyOwner({ ...nothingOpen, ...over })

describe('keyOwner', () => {
  it('gives the key to the editor when nothing is layered over the canvas', () => {
    expect(at({})).toBe('editor')
    expect(editorOwnsKey(nothingOpen)).toBe(true)
  })

  it('yields to a component that already claimed the event itself', () => {
    expect(at({ defaultPrevented: true })).toBe('handled')
  })

  it('yields to an open modal, which owns the keyboard outright', () => {
    expect(at({ modalOpen: true })).toBe('modal')
  })

  it('yields to a text field — Esc reverts the edit, Enter commits it', () => {
    expect(at({ typing: true })).toBe('textField')
  })

  it('yields to an open popover, whose own Esc closes it', () => {
    expect(at({ popoverOpen: true })).toBe('popover')
  })

  // The rule stated as one sentence: the deepest open thing wins, and the
  // canvas is the floor. Each of these outranks everything after it.
  it('resolves to the deepest layer when several are open at once', () => {
    expect(at({ defaultPrevented: true, modalOpen: true, typing: true, popoverOpen: true })).toBe('handled')
    expect(at({ modalOpen: true, typing: true, popoverOpen: true })).toBe('modal')
    expect(at({ typing: true, popoverOpen: true })).toBe('textField')
  })

  // The point of the whole ordering: a transform session must never be thrown
  // away by an Esc that was meant for something on top of it.
  it('never lets the editor act while anything at all is open', () => {
    for (const layer of ['defaultPrevented', 'modalOpen', 'typing', 'popoverOpen'] as const) {
      expect(editorOwnsKey({ ...nothingOpen, [layer]: true }), layer).toBe(false)
    }
  })
})
