/** One digital-stamp renderer for built-in, imported and historical presets.
 * BrushBehaviorPainter owns deposition/composition; this facade owns texture LRU. */
import type { Dab } from '@grafetto/shared'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import type { PaperSampling } from '../paper/PaperState'
import type { BrushDescriptor, BrushPressureSettings } from '../presets/digitalBrushPresets'
import { normalizeBrush } from '../presets/brushNormalization'
import type { PencilPreset } from '../presets/pencilPresets'
import { brushTextureMips, tipMaskMips, type BrushTextureId, type TipMaskId } from '../presets/tipMasks'
import { BrushBehaviorPainter, type BehaviorScratch } from './BrushBehaviorPainter'

export interface BrushContext {
  readonly gl: WebGLRenderingContext
  quadBuf(): WebGLBuffer
  readonly paper: PaperSampling
  segmentLength(dab: Dab, prev: Dab | undefined, radius: number): number
}
export interface BrushScratch {
  getOrCreate(tile: AccumulationBuffer): {original:AccumulationBuffer;coverage:AccumulationBuffer}
  noteBrushEdgePx(px:number):number
}

export class BrushPainter {
  private readonly behavior: BrushBehaviorPainter
  private readonly gl: WebGLRenderingContext
  private tipTextures = new Map<TipMaskId, WebGLTexture>()
  private brushTextures = new Map<BrushTextureId, WebGLTexture>()
  constructor(ctx: BrushContext) {
    this.gl=ctx.gl
    this.behavior=new BrushBehaviorPainter(ctx,id=>this.tipTexture(id),id=>this.brushTexture(id))
  }
  initGL():void {this.tipTextures.clear();this.brushTextures.clear();this.behavior.initGL()}
  destroy():void {
    this.behavior.destroy()
    for(const texture of [...this.tipTextures.values(),...this.brushTextures.values()])this.gl.deleteTexture(texture)
    this.tipTextures.clear();this.brushTextures.clear()
  }
  finish(scratch:BehaviorScratch):void {this.behavior.finish(scratch)}
  paint(target:ILayerBuffer,dabs:Dab[],preset:PencilPreset,stamp:{brush:BrushDescriptor;pressure:BrushPressureSettings},color:[number,number,number],scratch:BehaviorScratch,_previous:Dab|undefined):void {
    this.behavior.paint(target,dabs,preset,normalizeBrush(stamp.brush),stamp.pressure,color,scratch)
  }
  paintMask(target:Pick<ILayerBuffer,'resolveForPaint'|'markContentPainted'>,dabs:Dab[],brush:BrushDescriptor,pressure:boolean,scratch:BehaviorScratch,sizeMultiplier:number):void {
    this.behavior.paint(target,dabs,{opacity:1,hardness:1,sizeMultiplier},normalizeBrush(brush),{size:true,opacity:pressure},[1,1,1],scratch)
  }

  private brushTexture(id: BrushTextureId): WebGLTexture {
    const cached = this.brushTextures.get(id)
    if (cached) {
      // LRU order; imported texture residency is bounded independently of the
      // CPU resources retained for synchronous undo/replay.
      this.brushTextures.delete(id); this.brushTextures.set(id, cached)
      return cached
    }
    const tex = this.uploadMips(brushTextureMips(id), this.gl.REPEAT)
    if (id.startsWith('asset:')) this.trimImportedTextures(this.brushTextures)
    this.brushTextures.set(id, tex)
    return tex
  }

  /** One bitmap tip as a mipmapped LUMINANCE texture, uploaded on first use.
   *
   *  Every mip level comes from tipMaskMips on the CPU rather than from
   *  gl.generateMipmap — see that function on why the driver's filter is not
   *  trusted with a value every participant has to agree on. */
  private tipTexture(id: TipMaskId): WebGLTexture {
    const cached = this.tipTextures.get(id)
    if (cached) {
      this.tipTextures.delete(id); this.tipTextures.set(id, cached)
      return cached
    }
    const tex = this.uploadMips(tipMaskMips(id), this.gl.CLAMP_TO_EDGE)
    if (id.startsWith('asset:')) this.trimImportedTextures(this.tipTextures)
    this.tipTextures.set(id, tex)
    return tex
  }

  /** At most four imported masks and four imported grains per renderer:
   * roughly 43 MiB including CPU-built mips at 2048², rather than the library. */
  private trimImportedTextures(textures: Map<string, WebGLTexture>): void {
    const imported = [...textures.keys()].filter(key => key.startsWith('asset:'))
    if (imported.length < 4) return
    const key = imported[0]
    this.gl.deleteTexture(textures.get(key)!)
    textures.delete(key)
  }

  private uploadMips(levels: Uint8Array[], wrapMode: number): WebGLTexture {
    const { gl } = this
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    let size = Math.round(Math.sqrt(levels[0].length))
    for (let level = 0; level < levels.length; level++) {
      gl.texImage2D(gl.TEXTURE_2D, level, gl.LUMINANCE, size, size, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, levels[level])
      size = Math.max(1, size >> 1)
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode)
    return tex
  }
}
