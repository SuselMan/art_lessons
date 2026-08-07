import { describe, expect, it } from 'vitest'

import { BACKGROUND_LAYER_ID } from '@grafetto/shared'

import {
  toggleSelection, isAllSelected, toggleSelectAll, shouldExitOnEmpty, beyondTolerance,
} from './selection'

describe('toggleSelection (#411)', () => {
  it('adds an unselected id to the end', () => {
    expect(toggleSelection(['a'], 'b')).toEqual(['a', 'b'])
  })

  it('removes an already-selected id', () => {
    expect(toggleSelection(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('refuses the background, which is the paper and never a target', () => {
    expect(toggleSelection(['a'], BACKGROUND_LAYER_ID)).toEqual(['a'])
  })

  it('never mutates the list it was given', () => {
    const before = ['a']
    const after = toggleSelection(before, 'b')
    expect(before).toEqual(['a'])
    expect(after).not.toBe(before)
  })
})

describe('isAllSelected / toggleSelectAll (#411)', () => {
  it('reports all-selected regardless of order', () => {
    expect(isAllSelected(['a', 'b'], ['b', 'a'])).toBe(true)
  })

  it('is false while anything is left unticked', () => {
    expect(isAllSelected(['a', 'b'], ['a'])).toBe(false)
  })

  // Otherwise a panel showing nothing but the background would offer to
  // "deselect all" of nothing.
  it('an empty list is not all-selected', () => {
    expect(isAllSelected([], [])).toBe(false)
  })

  it('selects everything when something is missing', () => {
    expect(toggleSelectAll(['a', 'b'], ['a'])).toEqual(['a', 'b'])
  })

  it('clears when everything is already selected', () => {
    expect(toggleSelectAll(['a', 'b'], ['a', 'b'])).toEqual([])
  })

  // Selection can hold ids that are no longer on screen — a collapsed folder's
  // children, say — and "select all" is about what is visible.
  it('replaces rather than merges, so stale ids do not survive', () => {
    expect(toggleSelectAll(['a'], ['ghost'])).toEqual(['a'])
  })
})

describe('shouldExitOnEmpty (#411)', () => {
  it('closes the mode when the last tick is removed', () => {
    expect(shouldExitOnEmpty(['a'], [])).toBe(true)
  })

  // Entering from the toolbar starts empty; closing there would make the
  // button impossible to use.
  it('stays open when the selection was already empty', () => {
    expect(shouldExitOnEmpty([], [])).toBe(false)
  })

  it('stays open while anything remains', () => {
    expect(shouldExitOnEmpty(['a', 'b'], ['a'])).toBe(false)
  })
})

describe('beyondTolerance (#411)', () => {
  it('treats a still finger as still', () => {
    expect(beyondTolerance({ x: 10, y: 10 }, { x: 12, y: 12 }, 8)).toBe(false)
  })

  it('treats a travelling finger as a scroll', () => {
    expect(beyondTolerance({ x: 10, y: 10 }, { x: 10, y: 40 }, 8)).toBe(true)
  })

  // Diagonal drift must count as distance, not as two separate axes each
  // under the limit.
  it('measures diagonally rather than per axis', () => {
    expect(beyondTolerance({ x: 0, y: 0 }, { x: 7, y: 7 }, 8)).toBe(true)
  })
})
