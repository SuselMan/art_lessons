import type { BrushPreparationResource } from './BrushPreparation'
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
import { BrushTextureCache, uploadBrushTexture } from './BrushTextureCache'
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
  private readonly textures: BrushTextureCache
  constructor(ctx: BrushContext) {
    this.gl=ctx.gl
    this.textures=new BrushTextureCache(ctx.gl)
    this.behavior=new BrushBehaviorPainter(ctx,id=>this.tipTexture(id),id=>this.brushTexture(id),(tip,grain,dual,dualGrain)=>this.textures.protect([
      'g:cloud', 'g:grit',
      ...(tip ? [`t:${tip}`] : []), ...(grain ? [`g:${grain}`] : []),
      ...(dual ? [`t:${dual}`] : []), ...(dualGrain ? [`g:${dualGrain}`] : []),
    ]))
  }
  initGL():void {this.textures.clear(true);this.behavior.initGL()}
  destroy():void {
    this.behavior.destroy()
    this.textures.clear()
  }
  finish(scratch:BehaviorScratch):void {this.behavior.finish(scratch)}
  paint(target:ILayerBuffer,dabs:Dab[],preset:PencilPreset,stamp:{brush:BrushDescriptor;pressure:BrushPressureSettings},color:[number,number,number],scratch:BehaviorScratch,_previous:Dab|undefined):void {
    this.behavior.paint(target,dabs,preset,normalizeBrush(stamp.brush),stamp.pressure,color,scratch)
  }
  paintMask(target:Pick<ILayerBuffer,'resolveForPaint'|'markContentPainted'>,dabs:Dab[],brush:BrushDescriptor,pressure:boolean,scratch:BehaviorScratch,sizeMultiplier:number):void {
    this.behavior.paint(target,dabs,{opacity:1,hardness:1,sizeMultiplier},normalizeBrush(brush),{size:true,opacity:pressure},[1,1,1],scratch)
  }

  hasPreparedTexture(resource: BrushPreparationResource): boolean {
    return this.textures.get(`${resource.grain ? 'g' : 't'}:${resource.id}`) !== undefined
  }

  prepareTexture(group: readonly BrushPreparationResource[], resource: BrushPreparationResource): void {
    this.textures.protect(group.map(item => `${item.grain ? 'g' : 't'}:${item.id}`))
    if (resource.grain) this.brushTexture(resource.id as BrushTextureId)
    else this.tipTexture(resource.id as TipMaskId)
  }

  private brushTexture(id: BrushTextureId): WebGLTexture {
    const key=`g:${id}`, cached=this.textures.get(key)
    if(cached)return cached
    const entry=uploadBrushTexture(this.gl,brushTextureMips(id),this.gl.LUMINANCE,this.gl.REPEAT)
    this.textures.put(key,entry.texture,entry.bytes)
    return entry.texture
  }

  private tipTexture(id: TipMaskId): WebGLTexture {
    const key=`t:${id}`, cached=this.textures.get(key)
    if(cached)return cached
    const entry=uploadBrushTexture(this.gl,tipMaskMips(id),this.gl.LUMINANCE,this.gl.CLAMP_TO_EDGE)
    this.textures.put(key,entry.texture,entry.bytes)
    return entry.texture
  }
}
