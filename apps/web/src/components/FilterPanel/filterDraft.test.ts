import { describe, expect, it } from 'vitest'

import { LAYER_FILTER_KINDS } from '@grafetto/shared'

import { isIdentityFilter, normalizeLayerFilter } from '../../engine'
import { draftToFilter, initialDraft, resetKind } from './filterDraft'

describe('filter dialog draft (#574)', () => {
  it('turns every kind into a filter of that kind', () => {
    for (const kind of LAYER_FILTER_KINDS) {
      expect(draftToFilter(initialDraft(kind)).kind).toBe(kind)
    }
  })

  it('starts the colour filters at the identity and the blurs at a visible amount', () => {
    for (const kind of LAYER_FILTER_KINDS) {
      const identity = isIdentityFilter(normalizeLayerFilter(draftToFilter(initialDraft(kind))))
      expect(identity).toBe(kind !== 'gaussian_blur' && kind !== 'motion_blur')
    }
  })

  it('resetting one kind keeps the settings of the others', () => {
    let draft = initialDraft('hsl')
    draft = { ...draft, hsl: { hue: 40, saturation: 10, lightness: 0 }, gaussian: { radius: 30 } }
    const reset = resetKind(draft)
    expect(reset.hsl).toEqual({ hue: 0, saturation: 0, lightness: 0 })
    expect(reset.gaussian).toEqual({ radius: 30 })
  })
})
