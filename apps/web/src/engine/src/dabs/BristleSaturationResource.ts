import type {BrushBristle} from '@grafetto/shared'
import {acquireBristleSaturationLookup} from '../presets/bristleSaturationLookup'
import {retireBristleSaturationTable,writeBristleSaturationGpuStripe,bristleSaturationGpuLayout,type BristleSaturationTable,type BristleSaturationGpuLayout} from '../presets/brushBristleSaturationTable'
import type {BristleInkProfile} from '../presets/brushBristleInk'
import {BrushTextureCache} from './BrushTextureCache'
export const BRISTLE_SATURATION_GPU_BYTES=512*1024
export const BRISTLE_SATURATION_UPLOAD_BYTES=512*1024
export function bristleSaturationResourceKey(b:BrushBristle):string {
 if(b.version!==2||!b.ink.useSaturation||!b.saturationLookup)throw Error('Missing compiled Bristle saturation resource')
 const r=b.saturationLookup
 return `t:bristle-saturation:${r.version}:${r.encoding}:${r.asset}:${r.profileSha256}:${r.byteLength}`
}
export interface PreparedBristleSaturationResource {
 readonly profile:BristleInkProfile;readonly table:BristleSaturationTable
 readonly texture:WebGLTexture;readonly layout:BristleSaturationGpuLayout
 assertCurrent():void
 release():void
}
/** One current page in the existing painter GPU LRU. No second Batch texture,
 * descriptor bank, compiler, or unaccounted retained upload backing. */
export class BristleSaturationResource {
 private key?:string
 private epoch={}
 private readonly gl:WebGLRenderingContext
 private readonly cache:BrushTextureCache
 constructor(gl:WebGLRenderingContext,cache:BrushTextureCache){this.gl=gl;this.cache=cache}
 ready(b:BrushBristle):boolean{return this.key===bristleSaturationResourceKey(b)&&!!this.cache.get(this.key)}
 prepare(b:BrushBristle,groupKeys:readonly string[]):void {
  const key=bristleSaturationResourceKey(b)
  if(!groupKeys.includes(key))throw Error('Bristle saturation resource is absent from the admitted group')
  if(this.key===key&&this.cache.get(key))return
  const {table}=acquireBristleSaturationLookup(b)
  let texture:WebGLTexture|null=null,published=false,failed=false,primary:unknown
  const gl=this.gl
  try{
   if(gl.getParameter(gl.MAX_TEXTURE_SIZE)<1024)throw Error('Bristle saturation texture exceeds GPU dimensions')
   // Reject retirement of an active old draw before allocating or changing state.
   if(this.key&&this.key!==key)this.cache.remove(this.key)
   this.key=undefined;this.epoch={}
   const upload=new Uint8Array(BRISTLE_SATURATION_UPLOAD_BYTES)
   writeBristleSaturationGpuStripe(table,0,128,upload)
   const active=gl.getParameter(gl.ACTIVE_TEXTURE) as number,bound=gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture|null
   const keys=[gl.UNPACK_ALIGNMENT,gl.UNPACK_FLIP_Y_WEBGL,gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,gl.UNPACK_COLORSPACE_CONVERSION_WEBGL]
   const values=keys.map(k=>gl.getParameter(k) as number)
   let uploadFailed=false,uploadPrimary:unknown
   const restore=(fn:()=>void)=>{try{fn()}catch(error){if(!uploadFailed){uploadFailed=true;uploadPrimary=error}}}
   try{
    texture=gl.createTexture();if(!texture)throw Error('Bristle saturation allocation failed')
    gl.bindTexture(gl.TEXTURE_2D,texture)
    gl.pixelStorei(keys[0],1);gl.pixelStorei(keys[1],0);gl.pixelStorei(keys[2],0);gl.pixelStorei(keys[3],gl.NONE)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1024,128,0,gl.RGBA,gl.UNSIGNED_BYTE,upload)
   }catch(error){uploadFailed=true;uploadPrimary=error}
   finally{keys.forEach((k,i)=>restore(()=>gl.pixelStorei(k,Number(values[i]))));restore(()=>gl.activeTexture(active));restore(()=>gl.bindTexture(gl.TEXTURE_2D,bound))}
   if(uploadFailed)throw uploadPrimary
   this.cache.protect(groupKeys)
   this.cache.put(key,texture!,BRISTLE_SATURATION_GPU_BYTES)
   published=true;this.key=key
  }catch(error){failed=true;primary=error}
  finally{
   retireBristleSaturationTable(table)
   if(texture&&!published)try{gl.deleteTexture(texture)}catch(error){if(!failed){failed=true;primary=error}}
  }
  if(failed)throw primary
 }
 acquire(b:BrushBristle):PreparedBristleSaturationResource {
  const key=bristleSaturationResourceKey(b),texture=this.cache.get(key),epoch=this.epoch
  if(this.key!==key||!texture)throw Error('Bristle saturation GPU resource is not prepared')
  const {profile,table}=acquireBristleSaturationLookup(b)
  let released=false
  return Object.freeze({profile,table,texture,layout:bristleSaturationGpuLayout(table),assertCurrent:()=>{
   if(released||epoch!==this.epoch||this.key!==key||this.cache.get(key)!==texture)throw Error('Bristle saturation GPU resource was retired')
  },release:()=>{if(!released){released=true;retireBristleSaturationTable(table)}}})
 }
 reset():void {this.epoch={};this.key=undefined}
}
