import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { StampPainter } from '../dabs/StampPainter'

export interface WatercolorPassField { w: number; h: number; coverage: AccumulationBuffer }
export interface WatercolorPassesContext {
  gl(): WebGLRenderingContext
  screenBuf(): WebGLBuffer
  paperTex(): WebGLTexture
  paperScale(): number
  paperWorldSize(): { w: number; h: number }
  stamps(): StampPainter
}

