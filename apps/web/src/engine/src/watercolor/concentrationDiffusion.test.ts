import { describe, expect, it } from 'vitest'
import { concentrationPair } from './concentrationDiffusion'

describe('conservative static-solvent concentration exchange', () => {
  it('keeps P=cV stationary even for different V', () => {
    expect(concentrationPair([24, 32, 40, 48], [48, 64, 80, 96], 40, 80)).toEqual([0, 0, 0, 0])
  })
  it('closes a dry intermediate gap and rejects zero solvent', () => {
    expect(concentrationPair([255, 128, 200, 255], [0, 0, 0, 0], 64, 64, 0)).toEqual([0, 0, 0, 0])
    expect(concentrationPair([255, 128, 200, 255], [0, 0, 0, 0], 64, 0)).toEqual([0, 0, 0, 0])
  })
  it('reduces to the same scalar driving difference at constant V', () => {
    const a = [120, 120, 120, 120], b = [30, 30, 30, 30], v = 64
    const expected = Math.floor(.09 * (120 - 30) / (1 + 8 * (120 / (2 * v)) ** 2) + .00001)
    expect(concentrationPair(a, b, v, v)).toEqual([expected, expected, expected, expected])
  })
  it('conserves every component, reserves eight faces, and reverses exactly', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const a = [seed % 256, seed * 7 % 256, seed * 13 % 255 + 1, seed * 19 % 256]
      const b = [seed * 23 % 256, seed * 31 % 256, seed * 41 % 255 + 1, seed * 43 % 256]
      const q = concentrationPair(a, b, seed % 128 + 1, seed * 11 % 128 + 1)
      const reverse = concentrationPair(b, a, seed * 11 % 128 + 1, seed % 128 + 1)
      q.forEach((n, i) => {
        expect(n + reverse[i]).toBe(0)
        expect(a[i] - 8 * n).toBeGreaterThanOrEqual(0)
        expect(a[i] - 8 * n).toBeLessThanOrEqual(255)
        expect(b[i] + 8 * n).toBeGreaterThanOrEqual(0)
        expect(b[i] + 8 * n).toBeLessThanOrEqual(255)
        expect((a[i] - n) + (b[i] + n)).toBe(a[i] + b[i])
      })
    }
  })
})
