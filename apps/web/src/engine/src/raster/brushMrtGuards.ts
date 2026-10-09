import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
/** Diagnostic GL2 only: use buffer-owned RGBA8 storage authority, not driver queries. */
export function assertBrushMrtBuffers(gl: WebGLRenderingContext,
  field: {w: number; h: number; coverage: AccumulationBuffer},
  pigment: AccumulationBuffer, outPigment: AccumulationBuffer,
  color: AccumulationBuffer, outColor: AccumulationBuffer, flow: WebGLTexture): void {
  const inputs = [pigment, color, field.coverage], outputs = [outPigment, outColor]
  if (!Number.isInteger(field.w) || !Number.isInteger(field.h) || field.w <= 0 || field.h <= 0
    || [...inputs, ...outputs].some(buffer => buffer.gl !== gl || buffer.width !== field.w || buffer.height !== field.h
      || buffer.storageWidth !== field.w || buffer.storageHeight !== field.h)
    || outPigment.texture === outColor.texture
    || inputs.some(input => outputs.some(output => input.texture === output.texture))
    || outputs.some(output => output.texture === flow)) {
    throw new Error('Brush MRT unsafe texture alias/owner/storage dimensions')
  }
}
