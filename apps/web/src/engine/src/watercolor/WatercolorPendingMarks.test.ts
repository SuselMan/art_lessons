import { expect, it } from 'vitest'
import { WatercolorPendingMarks } from './WatercolorPendingMarks'

it('retires only the physically accepted batch and preserves immutable future pigment', () => {
  const marks = new WatercolorPendingMarks<{ id: string; color: readonly number[] }>()
  const water = Object.freeze({ id: 'water', color: Object.freeze([0, 0, 0]) })
  const pigment = Object.freeze({ id: 'pigment', color: Object.freeze([1, 0, 0]) })
  const a = marks.append('L', water), b = marks.append('L', pigment)
  marks.takeDirtyLayers()
  // The canonical water request accepted; its solver is still running.
  expect(marks.accepted(a)).toBe(true)
  expect(marks.pending('L')).toEqual([pigment])
  expect(marks.pending('L')[0]).toBe(pigment)
  expect(marks.accepted(a)).toBe(false)
  expect(marks.pending('L')).toEqual([pigment])
  expect(marks.accepted(b)).toBe(true)
  expect(marks.pending('L')).toEqual([])
  expect(marks.takeDirtyLayers()).toEqual(['L'])
})

it('coalesces retirement redraws and isolates unrelated layers and stale callbacks', () => {
  const marks = new WatercolorPendingMarks<string>()
  const a = marks.append('A', 'old'), b = marks.append('A', 'future'), other = marks.append('B', 'other')
  marks.takeDirtyLayers()
  marks.cancelled(a)
  marks.accepted(b)
  expect(marks.takeDirtyLayers()).toEqual(['A'])
  expect(marks.pending('B')).toEqual(['other'])
  marks.clear()
  const replacement = marks.append('A', 'replacement')
  expect(marks.accepted(a)).toBe(false)
  expect(marks.accepted(other)).toBe(false)
  expect(marks.pending('A')).toEqual(['replacement'])
  expect(marks.accepted(replacement)).toBe(true)
})
