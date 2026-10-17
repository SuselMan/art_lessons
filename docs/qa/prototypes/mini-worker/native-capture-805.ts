import {convertNativeCapture} from '../805-algorithm-search/webgpu/native-capture'
import {captureNativePaperHeight} from '../805-algorithm-search/webgpu/native-capture-gl'

const digest=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),b=>b.toString(16).padStart(2,'0')).join('')
let latest:Promise<any>|null=null
export function armNativeCapture(){latest=null}
/** QA-only single capture BEFORE the source clone/solver. Readback and hashing
 * are deliberately excluded from all timing experiments. No user canvas used. */
export function captureNativeOnce(engine:any,source:any,tile:any){
 if(latest)return
 latest=(async()=>{
  const entry=source.peek(tile.buffer),size=1024
  if(tile.buffer.width!==size||tile.buffer.height!==size||!entry?.inkColor||(!entry.solventLoad&&!entry.foreignSolventLoad))throw Error('Capture requires a full native wash and solvent')
  const ctx=engine._watercolorPasses.ctx,world=ctx.paperWorldSize(),paperScale=ctx.paperScale(),tileOrigin=[tile.originX,tile.originY] as const
  const gl:WebGLRenderingContext=engine.gl,savedFramebuffer=gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer|null
  let inkColor:Uint8Array,solvent:Uint8Array,foreignSolvent:Uint8Array|undefined
  try{inkColor=entry.inkColor.readPixels();solvent=entry.solventLoad?.readPixels()??new Uint8Array(size*size*4);foreignSolvent=entry.foreignSolventLoad?.readPixels()}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,savedFramebuffer)}
  const paperHeightRGBA=captureNativePaperHeight(engine.gl,ctx.paperTex(),size,tileOrigin,[world.w,world.h],paperScale)
  const converted=convertNativeCapture({size,seed:805,inkColor,solvent,foreignSolvent,paperHeightRGBA,tileOrigin,paperWorldSize:[world.w,world.h],paperScale})
  let carrierViolations=0
  for(let i=0;i<converted.input.rgba.length;i+=4)if(converted.input.rgba[i]>converted.input.rgba[i+3]||converted.input.rgba[i+1]>converted.input.rgba[i+3]||converted.input.rgba[i+2]>converted.input.rgba[i+3])carrierViolations++
  const rawSHA:Record<string,string>={},commonSHA:Record<string,string>={}
  for(const[name,bytes]of Object.entries({inkColor,solvent,...(foreignSolvent?{foreignSolvent}:{}),paperHeightRGBA}))rawSHA[name]=await digest(bytes)
  for(const[name,bytes]of Object.entries({rgba:converted.input.rgba,water:converted.input.water,paper:converted.input.paper}))commonSHA[name]=await digest(bytes)
  return{input:converted.input,manifest:{...converted.manifest,rawSHA,commonSHA,carrierViolations,validForBoundedCarrier:carrierViolations===0,nativeMaterialModel:source.finishContext?.profile?.materialModel??null,scope:'One owned PB15 wash, converted full1024 before native solve; no capture timing claim'}}
 })().catch(error=>({error:String(error?.stack??error)}))
}
export async function readNativeCapture(){
 if(!latest)throw Error('No native wash captured yet')
 const record=await latest
 if(record.error)throw Error(record.error)
 const input=record.input
 return{manifest:record.manifest,size:input.size,encoding:input.encoding,seed:input.seed,blob:new Blob([input.rgba.slice().buffer,input.water.slice().buffer,input.paper.slice().buffer],{type:'application/octet-stream'})}
}
