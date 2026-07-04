import { describe, expect, it } from 'vitest'

import { currentlyDrawing, sameIds } from './drawingIndicator'

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
