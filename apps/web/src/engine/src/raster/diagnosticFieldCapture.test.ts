import { it, expect } from 'vitest'
import { fieldCoverage, fieldStats } from '../../../../../../docs/qa/harness/728-engine-webgl2/fieldCapture'

it('validates true dimensions and reports every channel independently', () => {
  expect(fieldStats(new Uint8Array([0, 1, 3, 255, 5, 0, 0, 2]), 2, 1)).toEqual({ width: 2, height: 1, channels: 4, byteLength: 8, nonzero: [1, 1, 1, 2], max: [5, 1, 3, 255], sum: [5, 1, 3, 257] })
  expect(fieldStats(new Uint8Array([0, 12]), 1, 2, 1).max).toEqual([12])
  expect(() => fieldStats(new Uint8Array(8), 4, 1)).toThrow('dimensions')
  expect(() => fieldStats(new Uint8Array(0), 0, 0)).toThrow('dimensions')
})
it('rejects empty or incorrectly-labelled fields as parity evidence', () => {
  expect(fieldCoverage([], 0).nonemptyRequiredRoles).toBe(false)
  const records = [
    { role: 'P', channels: 4, max: [0, 0, 4, 12] },
    { role: 'C', channels: 4, max: [5, 0, 0, 12] },
    { role: 'cov', channels: 4, max: [0, 0, 0, 12] },
    { role: 'water', channels: 1, max: [12] },
    { role: 'h', channels: 1, max: [255] },
  ]
  expect(fieldCoverage(records, 5)).toEqual({ pigment: true, colour: true, water: true, cov: true, height: true, nonemptyRequiredRoles: true, mrtExercised: true })
  expect(fieldCoverage(records.map(r => r.role === 'P' ? { ...r, max: [2, 2, 0, 12] } : r), 5).nonemptyRequiredRoles).toBe(false)
  expect(fieldCoverage(records.map(r => r.role === 'C' ? { ...r, max: [0, 0, 0, 12] } : r), 5).nonemptyRequiredRoles).toBe(false)
  expect(fieldCoverage(records.filter(r => r.role !== 'water'), 5).nonemptyRequiredRoles).toBe(false)
  expect(fieldCoverage(records, 0).mrtExercised).toBe(false)
})
