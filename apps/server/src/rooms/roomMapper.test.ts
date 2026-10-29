import { expect, it } from 'vitest'
import { toWireRoom } from './roomMapper.js'

it('emits the trusted pinned raster version and never sanitizes an unknown value to legacy', () => {
  const row = { id: 'room', name: 'Room', paper: 'flat', paperColor: null, infinite: false, canvasWidth: 32, canvasHeight: 32,
    passwordHash: null, ownerId: 'owner', createdAt: new Date(0), accessMode: 'anyone_with_link' as const }
  expect(toWireRoom(row).rasterVersion).toBe('legacy-pm8-v1')
  expect(toWireRoom({ ...row, rasterVersion: 'straight-rgba8-v1' }).rasterVersion).toBe('straight-rgba8-v1')
  expect(() => toWireRoom({ ...row, rasterVersion: 'future' })).toThrow()
})
