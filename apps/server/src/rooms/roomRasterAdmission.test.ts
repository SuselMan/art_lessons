import { describe, expect, it, vi } from 'vitest'
const findUnique = vi.hoisted(() => vi.fn())
vi.mock('../db/prisma.js', () => ({ prisma: { room: { findUnique } } }))
import { admitsStoredRoomRaster, supportsCurrentRoomRaster } from './roomRasterAdmission.js'
import { inheritedBoardFields } from './lessons.js'

describe('server-owned raster admission', () => {
  it('keeps straight valid as metadata but fails closed before writers support it', () => {
    expect(supportsCurrentRoomRaster(undefined)).toBe(true)
    expect(supportsCurrentRoomRaster('legacy-pm8-v1')).toBe(true)
    for (const value of ['straight-rgba8-v1', 'future', false]) expect(supportsCurrentRoomRaster(value)).toBe(false)
  })
  it('asks the pixel-owning board and permits missing creation without admitting a future existing row', async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ rasterVersion: 'straight-rgba8-v1' }).mockResolvedValueOnce({ rasterVersion: 'future' })
    expect(await admitsStoredRoomRaster('board')).toBe(true)
    expect(await admitsStoredRoomRaster('board')).toBe(false)
    expect(await admitsStoredRoomRaster('board')).toBe(false)
    expect(findUnique).toHaveBeenLastCalledWith({ where: { id: 'board' }, select: { rasterVersion: true } })
  })
  it('inherits exact pinned metadata for new boards and rejects corrupt metadata', () => {
    const lesson = { id: 'lesson', ownerId: 'owner', paper: 'plain', paperColor: null, infinite: false, canvasWidth: 32, canvasHeight: 32, enabledTools: [] }
    expect(inheritedBoardFields(lesson).rasterVersion).toBe('legacy-pm8-v1')
    expect(inheritedBoardFields({ ...lesson, rasterVersion: 'straight-rgba8-v1' }).rasterVersion).toBe('straight-rgba8-v1')
    expect(() => inheritedBoardFields({ ...lesson, rasterVersion: 'future' })).toThrow()
  })
})
