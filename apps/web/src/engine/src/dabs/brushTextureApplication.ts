import type { BrushDescriptor } from '@grafetto/shared'
import { importedAssetPixels } from '../presets/importedBrushes'
import { TIP_MASK_SIZE } from '../presets/tipMasks'
import { brushDabRandom } from '../presets/digitalBrushPresets'

/** Per-gesture phase, reduced in world space before float uniforms cross GL. */
export function brushTextureApplication(texture: BrushDescriptor['texture'], seed: number, originX: number, originY: number, stream = 0): { application: [number,number,number,number]; mapping: [number,number,number,number] } {
  if (!texture?.application) return {application:[0,0,1,1],mapping:[1,1,0,0]}
  const size=texture.id.startsWith('asset:') ? Math.sqrt(importedAssetPixels(texture.id).length) : TIP_MASK_SIZE
  const width=texture.patternSize?.width ?? size, height=texture.patternSize?.height ?? size
  const periodX=texture.periodPx, periodY=periodX*height/width
  const offset=texture.offset
  const x=offset?.randomX ? Math.floor(brushDabRandom(seed,0x70000+stream*16)*periodX) : offset?.x ?? 0
  const y=offset?.randomY ? Math.floor(brushDabRandom(seed,0x70001+stream*16)*periodY) : offset?.y ?? 0
  const wrap=(value:number,period:number)=>((value%period)+period)%period
  return {application:[texture.application.mode==='multiply'?1:2,texture.application.soft?1:0,width,height],mapping:[periodX,size,wrap(originX-x,periodX),wrap(originY-y,periodY)]}
}
