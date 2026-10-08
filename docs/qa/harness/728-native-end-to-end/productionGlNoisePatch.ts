import {consistentNoiseShader,type ConsistentNoiseVariant} from './consistentNoise'
export function installProductionGlNoisePatch(canvas:HTMLCanvasElement,variant?:ConsistentNoiseVariant){
 const prototype=WebGLRenderingContext.prototype,original=prototype.shaderSource
 const records:Array<{original:string;patched:string}>=[]
 const patched=function(this:WebGLRenderingContext,shader:WebGLShader,source:string){
  if(this.canvas===canvas&&variant&&source.includes('vec2 f = fract(p);')){const next=consistentNoiseShader(source,variant);records.push({original:source,patched:next});return original.call(this,shader,next)}
  return original.call(this,shader,source)
 }
 if(variant)prototype.shaderSource=patched
 const digest=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('')
 return{
  restore(){if(variant){if(prototype.shaderSource!==patched)throw new Error('Concurrent shaderSource hook replaced diagnostic owner');prototype.shaderSource=original}},
  async report(){return{variant:variant??null,changedPrograms:records.length,sources:await Promise.all(records.map(async r=>({originalSha256:await digest(r.original),patchedSha256:await digest(r.patched)}))),scope:'Exact noise anchor substitution only on this production GL canvas; other contexts/native unchanged'}}
 }
}
