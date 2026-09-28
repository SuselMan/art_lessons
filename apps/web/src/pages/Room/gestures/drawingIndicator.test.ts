import { describe, expect, it } from 'vitest'

import {
  currentlyDrawing, currentlyDrawingLayers, layerActivityKey, sameIds, sameLayerDrawers,
} from './drawingIndicator'

describe('currentlyDrawing', () => {
  it('includes ids active within the timeout window', () => {
    const result = currentlyDrawing({ a: 1000, b: 1900 }, 2000, 1000)
    expect(result.sort()).toEqual(['a', 'b'])
  })

  it('excludes ids whose last activity is older than the timeout', () => {
    const result = currentlyDrawing({ a: 1900, b: 1000 }, 2000, 500)
    expect(result).toEqual(['a'])
  })

  it('returns an empty list when nobody is active', () => {
    expect(currentlyDrawing({}, 2000, 1000)).toEqual([])
  })

  it('boundary: exactly at the timeout is still considered active', () => {
    const result = currentlyDrawing({ a: 1000 }, 2000, 1000)
    expect(result).toEqual(['a'])
  })
})

describe('sameIds', () => {
  it('is true for equal sets regardless of order', () => {
    expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(true)
  })

  it('is false when lengths differ', () => {
    expect(sameIds(['a'], ['a', 'b'])).toBe(false)
  })

  it('is false when contents differ', () => {
    expect(sameIds(['a', 'b'], ['a', 'c'])).toBe(false)
  })

  it('is true for two empty lists', () => {
    expect(sameIds([], [])).toBe(true)
  })
})

describe('currentlyDrawingLayers', () => {
  const act = (userId: string, layerId: string, at: number) =>
    ({ [layerActivityKey(userId, layerId)]: { userId, layerId, at } })

  it('groups active users by the layer they draw into', () => {
    const result = currentlyDrawingLayers(
      { ...act('b', 'L1', 1900), ...act('a', 'L1', 1800), ...act('c', 'L2', 1950) },
      2000, 500,
    )
    expect(result).toEqual({ L1: ['a', 'b'], L2: ['c'] })
  })

  it('drops pairs older than the timeout, and layers left with nobody', () => {
    const result = currentlyDrawingLayers(
      { ...act('a', 'L1', 1000), ...act('a', 'L2', 1900) },
      2000, 500,
    )
    expect(result).toEqual({ L2: ['a'] })
  })
})

describe('sameLayerDrawers', () => {
  it('ignores drawer order', () => {
    expect(sameLayerDrawers({ L1: ['a', 'b'] }, { L1: ['b', 'a'] })).toBe(true)
  })

  it('notices a layer appearing, disappearing or changing hands', () => {
    expect(sameLayerDrawers({}, { L1: ['a'] })).toBe(false)
    expect(sameLayerDrawers({ L1: ['a'] }, {})).toBe(false)
    expect(sameLayerDrawers({ L1: ['a'] }, { L2: ['a'] })).toBe(false)
    expect(sameLayerDrawers({ L1: ['a'] }, { L1: ['b'] })).toBe(false)
  })
})
