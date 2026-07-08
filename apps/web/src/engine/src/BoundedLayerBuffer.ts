import { AccumulationBuffer } from './AccumulationBuffer'
import type { ILayerBuffer, PaintTarget } from './ILayerBuffer'
import type { WorldRect } from './tileMath'

/** Fixed-canvas ILayerBuffer — a thin wrapper around exactly today's
 *  AccumulationBuffer(gl, canvas.width, canvas.height), so fixed-canvas
 *  rooms keep their pre-tiling behavior byte-for-byte (including the #133
 *  clip-at-canvas-edge behavior — intentional there, since a fixed-canvas
 *  room genuinely has a fixed canvas). worldRect is ignored: there's only
 *  ever the one buffer, at origin (0,0), same as every buffer in the engine
 *  before this change. */
export class BoundedLayerBuffer implements ILayerBuffer {
  readonly buffer: AccumulationBuffer

  constructor(gl: WebGLRenderingContext, width: number, height: number) {
    this.buffer = new AccumulationBuffer(gl, width, height)
  }

  clear(): void { this.buffer.clear() }
  destroy(): void { this.buffer.destroy() }

  resolveForPaint(_worldRect: WorldRect): PaintTarget[] {
    return [{ buffer: this.buffer, originX: 0, originY: 0 }]
  }

  resolveVisible(_worldRect: WorldRect): PaintTarget[] {
    return [{ buffer: this.buffer, originX: 0, originY: 0 }]
  }
}
