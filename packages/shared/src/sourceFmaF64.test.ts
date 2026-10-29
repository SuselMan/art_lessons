import { expect, it, vi } from 'vitest'
import { sourceFmaF64 } from './sourceFmaF64.js'
import * as reference from './sourceFmaF64Reference.js'

it('uses the actual fallback module for extreme inputs and avoids it for ordinary geometry', () => {
  const fallback = vi.spyOn(reference, 'sourceFmaF64Reference')
  try {
    // Positive control: this spy observes the same binding used by the moved kernel.
    expect(sourceFmaF64(Number.MIN_VALUE, 1, 0)).toBe(Number.MIN_VALUE)
    expect(fallback).toHaveBeenCalledOnce()
    fallback.mockClear()
    for (const [a, b, c] of [[.1, 40, Math.cos(Math.PI / 2) * 4], [.73, .61, -.27], [1 + 2 ** -27, 1 - 2 ** -27, -1], [0, 1, -.7], [2, 3, 0]]) sourceFmaF64(a, b, c)
    expect(fallback).not.toHaveBeenCalled()
    for (const n of [NaN, Infinity, -Infinity, '1', null, undefined, 1n, Symbol()] as never[]) expect(() => sourceFmaF64(n, 1, 1)).toThrow(RangeError)
  } finally { fallback.mockRestore() }
})
