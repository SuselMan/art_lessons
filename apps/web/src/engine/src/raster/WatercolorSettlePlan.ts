import type { RibbonStrokeScratch, RibbonFinishMetadata } from '../buffers/RibbonStrokeScratch'
import type { WatercolorPasses } from './WatercolorPasses'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { PaintTarget } from '../buffers/ILayerBuffer'
import type { SettleField } from '../buffers/SettleField'
import { CanonicalWatercolorSettlePlan } from './CanonicalWatercolorSettlePlan'
import type { SettlePlanUploads } from '../watercolor/SettlePlanContracts'

export type WatercolorSettlePreview = (tile: PaintTarget, pigment: AccumulationBuffer, color: AccumulationBuffer | null, coverage: AccumulationBuffer) => void

export interface WatercolorSettlePlanContext {
  gl(): WebGLRenderingContext
  fieldFor(w: number, h: number, captureClearsInputs?: boolean): SettleField
  paperWorldSize(): { w: number; h: number }
  pool(): RibbonScratchPool
  minmaxExt(): { MAX_EXT: number } | null
  ab(): { noDiffuse: boolean; noCarry: boolean; opDry: boolean }
  /** Presentation only; canonical solver steps and final landing never consult this. */
  shouldPreview?(): boolean
  /** Optional #728 late fibre diagnostic; canonical log remains unchanged. */
  gradientFibres?(): boolean
  passes(): WatercolorPasses
}

/** WebGL transport adapter; all solver decisions live in the common plan. */
export class WatercolorSettlePlan extends CanonicalWatercolorSettlePlan<AccumulationBuffer, WebGLTexture> {
  override prepare(scratch: RibbonStrokeScratch, targets: PaintTarget[], bounds: { minX: number; minY: number; maxX: number; maxY: number }, bloom = 0, radiusPx = 16, water = 1, landedWet = 0, standing = 1, wetPeak = 0, dwellMs = 0, preview?: WatercolorSettlePreview, skipZeroPigmentContacts = false, finishMetadata?: RibbonFinishMetadata, presentationOwnerLocked = false) {
    return super.prepare(scratch, targets, bounds, bloom, radiusPx, water, landedWet, standing, wetPeak, dwellMs, preview, skipZeroPigmentContacts, finishMetadata, presentationOwnerLocked)
  }

  private readonly legacyContext: WatercolorSettlePlanContext
  protected get gl(): WebGLRenderingContext { return this.legacyContext.gl() }
  constructor(ctx: WatercolorSettlePlanContext) {
    const uploads: SettlePlanUploads<WebGLTexture> = {
      create: () => ctx.gl().createTexture(),
      bindFlow: (texture, configure) => {
        const gl = ctx.gl()
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        if (configure) configureLinear(gl)
      },
      uploadFlow: (_texture, width, height, pixels, reuse) => {
        const gl = ctx.gl()
        if (reuse) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      },
      uploadForeign: (texture, width, height, pixels) => {
        const gl = ctx.gl()
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        configureLinear(gl)
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, pixels)
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
      },
      destroy: texture => ctx.gl().deleteTexture(texture),
    }
    super({
      fieldFor: (w, h, capture) => ctx.fieldFor(w, h, capture),
      paperWorldSize: () => ctx.paperWorldSize(), pool: () => ctx.pool(),
      supportsFilm: () => !!ctx.minmaxExt(), ab: () => ctx.ab(),
      shouldPreview: ctx.shouldPreview ? () => ctx.shouldPreview!() : undefined,
      gradientFibres: ctx.gradientFibres ? () => ctx.gradientFibres!() : undefined,
      passes: () => ctx.passes(), uploads,
    })
    this.legacyContext = ctx
  }
}
function configureLinear(gl: WebGLRenderingContext): void {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}
