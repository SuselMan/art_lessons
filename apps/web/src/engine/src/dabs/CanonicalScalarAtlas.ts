import type {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache,allocateOwnedBrushTexture,combineOwnedBrushResources,releaseUnpublishedBrushResource,type OwnedBrushResource} from './BrushTextureCache'
import {prepareSourceScalarPowerTable,type SourceScalarPowerTableOwner,type SourceScalarPowerTableView,type SourceScalarPowerMode} from '../presets/sourceScalarPowerTable'
import {assertBrushGlMutationIdle} from './BrushGlBatch'
export const CANONICAL_SCALAR_ATLAS_GPU_BYTES=65536
const PAGE_METADATA_BYTES=2048
const UPLOAD_STAGING_BYTES=65536
interface Page{readonly mode:SourceScalarPowerMode;readonly key:string;readonly texture:WebGLTexture;readonly epoch:{alive:boolean};readonly table:SourceScalarPowerTableOwner}
export interface CanonicalScalarAtlasResource{readonly key:string;readonly bytes:65536;readonly texture:WebGLTexture;readonly view:SourceScalarPowerTableView}
/** One owning service per composite workspace; no global decoded-page cache. */
export class CanonicalScalarAtlas{
 private readonly pages=new Map<SourceScalarPowerMode,Page>()
 private generation=0
 private pending=false
 private pendingController?:AbortController
 private readonly gl:WebGLRenderingContext
 private readonly cache:BrushTextureCache
 private readonly cpu:BrushMipCache
 private readonly prefix:string
 constructor(gl:WebGLRenderingContext,cache:BrushTextureCache,cpu:BrushMipCache,prefix:string){this.gl=gl;this.cache=cache;this.cpu=cpu;this.prefix=prefix}
 private current(page:Page):boolean{return page.epoch.alive&&this.cache.get(page.key)===page.texture&&this.cache.resourceBytes(page.key)===65536}
 has(mode:SourceScalarPowerMode):boolean{const page=this.pages.get(mode);return !!page&&this.current(page)}
 resource(mode:SourceScalarPowerMode):CanonicalScalarAtlasResource{
  const page=this.pages.get(mode);if(!page||!this.current(page))throw new Error('Scalar atlas is not prepared')
  return Object.freeze({key:page.key,bytes:65536 as const,texture:page.texture,view:page.table.view})
 }

 sampler(mode:SourceScalarPowerMode):{key:string;bytes:number;texture:WebGLTexture;epoch:object}{const page=this.pages.get(mode);if(!page||!this.current(page))throw new Error('Scalar sampler is not prepared');return {key:page.key,bytes:65536,texture:page.texture,epoch:page.epoch}}
 resources():readonly {key:string;bytes:number}[]{return [...this.pages.values()].filter(page=>this.current(page)).map(page=>({key:page.key,bytes:65536}))}
 async prepare(mode:SourceScalarPowerMode,companions:readonly {key:string;bytes:number}[],assertEpoch:()=>void,signal?:AbortSignal):Promise<void>{
  assertEpoch();assertBrushGlMutationIdle(this.gl)
  const existing=this.pages.get(mode);if(existing&&this.current(existing))return
  if(this.pending)throw new Error('Scalar atlas preparation is already active')
  for(const [other,page]of this.pages)if(other!==mode&&!this.cache.hasResourceLease(page.key)){this.cache.discard(page.key);this.pages.delete(other)}
  this.pending=true
  const controller=new AbortController(),externalSignal=signal,abort=()=>controller.abort()
  this.pendingController=controller
  externalSignal?.addEventListener('abort',abort,{once:true});if(externalSignal?.aborted)controller.abort()
  signal=controller.signal
  let table:SourceScalarPowerTableOwner|undefined,releaseMetadata:undefined|(()=>void),releaseUpload:undefined|(()=>void),releaseLeaseMetadata:undefined|(()=>void),lease:undefined|(()=>void),resource:OwnedBrushResource|undefined,adopted=false,failed=false,primary:unknown
  const attempt=(fn:()=>void)=>{try{fn()}catch(error){if(!failed){failed=true;primary=error}}}
  const key=this.prefix+':scalar-power:'+mode+':'+(++this.generation)
  try{
   releaseLeaseMetadata=this.cpu.reserve(512+(companions.length+1)*128)
   lease=this.cache.leaseRequired([...companions,{key,bytes:65536}])
   table=await prepareSourceScalarPowerTable(mode,this.cpu,this,signal)
   assertEpoch();assertBrushGlMutationIdle(this.gl);if(signal?.aborted)throw new DOMException('Scalar atlas preparation cancelled','AbortError')
   const gl=this.gl
   if(gl.getParameter(gl.MAX_TEXTURE_SIZE)<256||gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)<5)throw new RangeError('Scalar atlas requires a fifth texture unit and 256 rows')
   releaseMetadata=this.cpu.reserve(PAGE_METADATA_BYTES);releaseUpload=this.cpu.reserve(UPLOAD_STAGING_BYTES)
   if(!this.cache.isResourceLeaseCurrent(lease))throw new Error('Scalar atlas planned lease retired')
   const upload=new Uint8Array(65536);table.copyInto(upload,this,this.cpu)
   const active=gl.getParameter(gl.ACTIVE_TEXTURE),alignment=gl.getParameter(gl.UNPACK_ALIGNMENT),flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premultiply=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),colorspace=gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL)
   const gl2=gl as WebGL2RenderingContext
   const extra=typeof gl2.UNPACK_ROW_LENGTH==='number'?[gl2.UNPACK_ROW_LENGTH,gl2.UNPACK_IMAGE_HEIGHT,gl2.UNPACK_SKIP_PIXELS,gl2.UNPACK_SKIP_ROWS,gl2.UNPACK_SKIP_IMAGES].map(name=>[name,gl.getParameter(name)]as const):[]
   const pbo=typeof gl2.PIXEL_UNPACK_BUFFER_BINDING==='number'?gl.getParameter(gl2.PIXEL_UNPACK_BUFFER_BINDING):undefined
   let texture:WebGLTexture|null=null,capturedTexture=false
   try{
    gl.activeTexture(gl.TEXTURE0);texture=gl.getParameter(gl.TEXTURE_BINDING_2D);capturedTexture=true
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,0);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,0);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE)
    for(const[name]of extra)gl.pixelStorei(name,0);if(pbo!==undefined)gl.bindBuffer(gl2.PIXEL_UNPACK_BUFFER,null)
    resource=allocateOwnedBrushTexture(gl,65536,(handle,mark)=>{gl.bindTexture(gl.TEXTURE_2D,handle);mark(65536);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,64,256,0,gl.RGBA,gl.UNSIGNED_BYTE,upload);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)})
   }catch(error){failed=true;primary=error}
   finally{
    attempt(()=>gl.activeTexture(gl.TEXTURE0));if(capturedTexture)attempt(()=>gl.bindTexture(gl.TEXTURE_2D,texture));attempt(()=>gl.pixelStorei(gl.UNPACK_ALIGNMENT,alignment));attempt(()=>gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip));attempt(()=>gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,premultiply));attempt(()=>gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,colorspace));for(const[name,value]of extra)attempt(()=>gl.pixelStorei(name,value));if(pbo!==undefined)attempt(()=>gl.bindBuffer(gl2.PIXEL_UNPACK_BUFFER,pbo));attempt(()=>gl.activeTexture(active))
   }
   if(failed)throw primary
   assertEpoch();if(!this.cache.isResourceLeaseCurrent(lease))throw new Error('Scalar atlas planned lease retired');if(signal?.aborted)throw new DOMException('Scalar atlas preparation cancelled','AbortError')
   const heldTable=table,heldMetadata=releaseMetadata!,epoch={alive:true},page:Page={mode,key,texture:resource!.texture,epoch,table:heldTable}
   resource=combineOwnedBrushResources(resource!,[],()=>{epoch.alive=false;if(this.pages.get(mode)===page)this.pages.delete(mode);let failed=false,primary:unknown;try{heldTable.release()}catch(error){failed=true;primary=error}try{heldMetadata()}catch(error){if(!failed){failed=true;primary=error}}if(failed)throw primary})
   table=undefined;releaseMetadata=undefined
   this.cache.protect([...companions.map(item=>item.key),key]);this.cache.putOwned(key,resource);adopted=true
   this.pages.set(mode,page)
  }catch(error){if(!failed){failed=true;primary=error}}
  finally{
   if(!adopted&&resource)attempt(()=>{if(this.cache.get(key)===resource!.texture)this.cache.discard(key);else releaseUnpublishedBrushResource(resource!)});if(table)attempt(()=>table!.release());if(releaseMetadata)attempt(releaseMetadata);if(releaseUpload)attempt(releaseUpload);if(lease)attempt(lease);if(releaseLeaseMetadata)attempt(releaseLeaseMetadata);externalSignal?.removeEventListener('abort',abort);if(this.pendingController===controller)this.pendingController=undefined;this.pending=false
  }
  if(failed)throw primary
 }
 reset(lost=false):void{this.pendingController?.abort();let failed=false,primary:unknown;for(const page of this.pages.values())try{this.cache.discard(page.key,lost)}catch(error){if(!failed){failed=true;primary=error}}this.pages.clear();if(failed)throw primary}
}
