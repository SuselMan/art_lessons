import { describe, expect, it } from 'vitest'
import { exactFrame, frameEdgeX, frameEdgeY, type CameraFrame } from './cameraFrame'

describe('CameraFrame', () => {
  it('an exact frame maps its bounds onto the whole target, pixel for pixel', () => {
    const frame = exactFrame({ x: -300, y: 1024, width: 517, height: 90 })
    expect(frame.scale).toBe(1)
    expect(frame.angle).toBe(0)
    expect(frameEdgeX(frame, -300)).toBe(0)
    expect(frameEdgeX(frame, -300 + 517)).toBe(517)
    expect(frameEdgeY(frame, 1024)).toBe(0)
    expect(frameEdgeY(frame, 1024 + 90)).toBe(90)
    expect(frame.view).toEqual({ minX: -300, minY: 1024, maxX: 217, maxY: 1114 })
  })

  it('places the camera point on the frame centre and scales around it', () => {
    const frame: CameraFrame = {
      wx: 311, wy: -45, centerX: 400, centerY: 300, scale: 0.5, angle: 0.3,
      view: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    }
    expect(frameEdgeX(frame, 311)).toBe(400)
    expect(frameEdgeY(frame, -45)).toBe(300)
    expect(frameEdgeX(frame, 311 + 1024)).toBe(400 + 512)
    expect(frameEdgeY(frame, -45 - 101)).toBe(300 - 50) // 249.5: Math.round goes toward +inf
  })
})
