import {diffusionStencilCells,uploadViewDescriptor} from '../728-crossgpu-neighborhood/stencil.mjs';
import {worldRead} from './neighborhood-base.mjs';

/** Diagnostic OFF. Mapping is derived from actual tiles/field/copy arguments. */
export function copiedFrame(src,dst,sx,sy,dx,dy,ratio=1){
  if(!src||![sx,sy,dx,dy,ratio].every(Number.isFinite)||ratio<=0)return null;
  const S=src.S*ratio;
  return {x0:src.x0+sx*src.S-dx*S,y0:src.y0+(src.h-sy)*src.S-(dst.height-dy)*S,S,w:dst.width,h:dst.height,via:'actual-copy/resample'};
}
export function installPhysicalCapture(e,{enabled=false,point=[994,1231],ids=['Gq9CPrzxWh','ytlRBmw3Tg'],cap=8192,bufferPrototype=null,paperBytes=null,paperResolution=2048,paperChannels=2}={}){
  const rows=[],errors=[],undo=[];let op=null,ordinal=0,truncated=false,vectorTruncated=false;
  if(!enabled)return {begin(){},end(){},rows,summary:()=>({enabled:false,rows:0}),dispose(){}};
  if(!point.every(Number.isFinite)||!Number.isInteger(cap)||cap<2)throw Error('capture configuration');
  const gl=e.gl,passes=e._watercolorPasses,plan=e._settlePlan,ctx=plan.ctx;
  for(const name of ['_drawRibbonNibPass','_drawRibbonBands','_drawRibbonCompositeRect'])if(typeof e[name]!=='function')throw Error('actual source capture seam absent '+name);
  const sample=e._layers?.values().next().value?.allResident?.()[0]?.buffer;
  const prototype=bufferPrototype??(sample&&Object.getPrototypeOf(sample));
  const scalarObject=o=>Object.fromEntries(Object.entries(o??{}).filter(([,v])=>v===null||['number','string','boolean'].includes(typeof v)||Array.isArray(v)).map(([k,v])=>[k,Array.isArray(v)?[...v]:v]));
  for(const[owner,keys]of [[ctx,['fieldFor']],[plan,['prepare']],[passes,['fieldOp','waterFrontStep','brushPass','wcResample','diffuseStep','pigmentColor']],[prototype,['copyTo','copyRegionInto']]])
    if(!owner||keys.some(k=>typeof owner[k]!=='function'))throw Error('Capture seam preflight; no wrapper installed');
  const maps=new WeakMap(),roles=new WeakMap(),identity=new WeakMap();let nextIdentity=1,preparing=null;
  const id=b=>{if(!b)return null;if(!identity.has(b))identity.set(b,nextIdentity++);return identity.get(b)};
  const active=()=>op&&ids.includes(op.id);
  const set=(b,m,role)=>{if(!b||!m)return;maps.set(b,{...m,w:b.width,h:b.height});if(role)roles.set(b,role)};
  const primitive=x=>((Array.isArray(x)||ArrayBuffer.isView(x))&&x.length>32768)?(vectorTruncated=true,{uncapturedLength:x.length,reason:'bounded immutable vertex/uniform capture'}):Array.isArray(x)?x.map(primitive):ArrayBuffer.isView(x)?Array.from(x):x===null||['number','boolean','string'].includes(typeof x)?x:undefined;
  function read(b){
    if(!b)return {absent:true};const m=maps.get(b),label={identity:id(b),role:roles.get(b)??null,size:[b.width,b.height]};
    if(!b.fbo||!m)return {...label,unmapped:true,reason:'no proven physical world frame; no invented ROI'};
    const r=worldRead(m,point);if(!r)return {...label,meta:m,outside:true};
    let sampler=null;if(b.texture&&typeof gl.getTexParameter==='function'){const textureBefore=gl.getParameter(gl.TEXTURE_BINDING_2D);try{gl.bindTexture(gl.TEXTURE_2D,b.texture);sampler={min:gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER),mag:gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER),wrapS:gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S),wrapT:gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T)}}finally{gl.bindTexture(gl.TEXTURE_2D,textureBefore)}}
    const previous=gl.getParameter(gl.FRAMEBUFFER_BINDING),bytes=new Uint8Array(r.w*r.h*4);
    try{gl.bindFramebuffer(gl.FRAMEBUFFER,b.fbo);gl.readPixels(r.x,r.y,r.w,r.h,gl.RGBA,gl.UNSIGNED_BYTE,bytes)}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,previous)}
    return {...label,meta:m,sampler,read:r,bytes:Array.from(bytes),scope:'local output neighborhood only; stencil equality NOT established'};
  }
  function diffuseDonors(src,coverage,m,radius,knight){
    const cells=diffusionStencilCells(m,point,radius,knight,paperResolution),donors={};
    for(const[key,b]of Object.entries({ink:src,coverage})){
      if(!b?.fbo||b.width!==m.w||b.height!==m.h){donors[key]={known:false};continue}
      const prior=gl.getParameter(gl.FRAMEBUFFER_BINDING),patches=[];
      try{gl.bindFramebuffer(gl.FRAMEBUFFER,b.fbo);for(const c of cells){if(c.outside){patches.push({cell:c.cell,outside:true});continue}const x=Math.max(0,c.cell[0]-2),y=Math.max(0,c.cell[1]-2),w=Math.min(m.w-x,c.cell[0]+3-x),h=Math.min(m.h-y,c.cell[1]+3-y);const bytes=new Uint8Array(w*h*4);gl.readPixels(x,y,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);patches.push({cell:c.cell,uv:c.uv,read:[x,y,w,h],bytes:Array.from(bytes)})}}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,prior)}
      donors[key]={known:true,patches};
    }
    const known=ArrayBuffer.isView(paperBytes)&&paperBytes.byteLength===paperResolution*paperResolution*paperChannels;
    const paperDonors=known?{known:true,uploadBindingVerified:false,provenance:uploadViewDescriptor(paperBytes),samples:cells.map(c=>c.outside?{cell:c.cell,outside:true}:{cell:c.cell,paperUV:c.paperUV,paperCells:c.paperCells,fraction:c.fraction,heightBytes:c.paperCells.map(([x,y])=>paperBytes[(y*paperResolution+x)*paperChannels])})}:{known:false};
    return {cells,donors,paperDonors,unusedArguments:{density:{bound:false},solvent:{bound:false}},externalUpload:{known:false},fullyKnownShaderInputs:false};
  }
  function record(stage,n,buffers,options){
    if(!active())return;if(rows.length>=cap){truncated=true;return}
    try{rows.push({op:{...op},ordinal:n,stage,fields:Object.fromEntries(Object.entries(buffers).map(([k,b])=>[k,read(b)])),options})}
    catch(error){errors.push({op:{...op},ordinal:n,stage,error:String(error)})}
  }
  function wrap(owner,key,around){const original=owner[key];if(typeof original!=='function')throw Error('actual seam absent '+key);owner[key]=function(...args){return around.call(this,original,args)};undo.push(()=>owner[key]=original)}
  function call(original,self,args,stage,inputs,output,options={}){
    const n=ordinal++;record(stage+'-before',n,inputs,options);const result=original.apply(self,args);record(stage+'-after',n,output,options);return result;
  }
  const tileFrame=(tile)=>({x0:tile.originX,y0:tile.originY,S:1,w:tile.buffer.width,h:tile.buffer.height});
  wrap(e,'_drawRibbonNibPass',function(original,args){const[dest,tile,dab,preset,profile]=args;set(dest,tileFrame(tile),'source:nib');return call(original,this,args,'ribbonNib',{previousOutput:dest,clipTo:args[13]},{dest},{dab:scalarObject(dab),preset:scalarObject(preset),profile:scalarObject(profile),scalars:args.slice(5).map(primitive),paperAndNoiseInputEqual:false})});
  wrap(e,'_drawRibbonBands',function(original,args){const[dest,tile,bands]=args;set(dest,tileFrame(tile),'source:bands');const available=args[14];return call(original,this,args,'ribbonBands',{previousOutput:dest,available},{dest},{vertices:primitive(bands),scalars:args.slice(3).map(primitive),paperAndNoiseInputEqual:false})});
  wrap(e,'_drawRibbonCompositeRect',function(original,args){const[tile,bounds,preset,profile,originalBuffer,coverage,inkLoad,inkColor]=args,m=tileFrame(tile);for(const b of [tile.buffer,originalBuffer,coverage,inkLoad,inkColor])set(b,m,roles.get(b));return call(original,this,args,'ribbonComposite',{original:originalBuffer,coverage,inkLoad,inkColor},{dest:tile.buffer},{bounds:scalarObject(bounds),preset:scalarObject(preset),profile:scalarObject(profile),scalars:args.slice(8).map(primitive),paperAndNoiseInputEqual:false})});
  wrap(ctx,'fieldFor',function(original,args){const field=original.apply(this,args);if(preparing?.bounds){const b=preparing.bounds,S=(b.maxX-b.minX)/args[0];if(!Number.isFinite(S)||S<=0||Math.abs(S-(b.maxY-b.minY)/args[1])>1e-9)throw Error('actual field scale mismatch');const m={x0:b.minX,y0:b.minY,S,w:field.w,h:field.h};for(const key of ['a','b','c','ca','cb','cc','coverage','mask','pressure','band'])set(field[key],m,'field:'+key)}return field});
  wrap(plan,'prepare',function(original,args){
    const [scratch,targets]=args,previous=preparing,old=scratch.noteStorageBounds;preparing={};
    for(const tile of targets){const m={x0:tile.originX,y0:tile.originY,S:1,w:tile.buffer.width,h:tile.buffer.height};set(tile.buffer,m,'resident:composite');const entry=scratch.peek(tile.buffer);if(entry)for(const[key,b]of Object.entries(entry))if(b?.fbo)set(b,m,'resident:'+key)}
    scratch.noteStorageBounds=function(bounds){preparing.bounds={...bounds};return old.call(this,bounds)};
    try{return original.apply(this,args)}finally{scratch.noteStorageBounds=old;preparing=previous}
  });
  wrap(passes,'fieldOp',function(original,args){const[out,a,b,mode,k,opts={}]=args,m=maps.get(out)||maps.get(a)||maps.get(b);if(m&&!maps.has(out)&&out.width===m.w&&out.height===m.h)set(out,m,'field-derived');const options={mode,k,...Object.fromEntries(Object.entries(opts).filter(([,v])=>primitive(v)!==undefined).map(([k,v])=>[k,primitive(v)])),textureInputs:['c','d','e','path'].filter(k=>opts[k]),paper:'actual paper texture external; raw LA/sampler supplied separately'};return call(original,this,args,'field-'+mode,{a,b,c:opts.c,d:opts.d,e:opts.e,path:opts.path},{out},options)});
  wrap(passes,'waterFrontStep',function(original,args){const[field,x0,y0,dryCost,src,dst,max,climb,floor,stride=1,S=1,foreign]=args;const m={x0,y0,S,w:field.w,h:field.h};set(src,m,roles.get(src));set(dst,m,roles.get(dst));return call(original,this,args,'waterFront',{src,coverage:field.coverage},{dst},{x0,y0,dryCost,max,climb,floor,stride,S,foreignTexture:!!foreign,foreignInputEqual:false,paperInputEqual:false})});
  wrap(passes,'brushPass',function(original,args){const[field,flow,radius,S,source,out,pigment,flowRect,scissor,color,pulseGain]=args;const m=maps.get(source)||maps.get(pigment);if(m&&!maps.has(out))set(out,m,'brush-derived');return call(original,this,args,'brush',{source,pigment,coverage:field.coverage,color},{out},{radius,S,flowRect:[...flowRect],scissor:[...scissor],pulseGain,flowTexture:!!flow,flowInputEqual:false})});
  wrap(passes,'wcResample',function(original,args){const[dst,dx,dy,dw,dh,src,sx,sy,ratio,mode,old,base,clampRect]=args;if(!maps.has(dst)){const m=copiedFrame(maps.get(src),dst,sx,sy,dx,dy,ratio);set(dst,m,'resample-derived')};return call(original,this,args,'resample',{src,old,base},{dst},{dx,dy,dw,dh,sx,sy,ratio,mode,clampRect:clampRect&&[...clampRect]})});
  wrap(passes,'diffuseStep',function(original,args){const[field,x0,y0,S,tw,th,src,dst,radius,knight,coverage,density,solvent]=args;const m={x0,y0,S,w:field.w,h:field.h,paper:{w:tw,h:th},paperScale:e._paper?.scale??ctx.paperScale?.()};for(const b of [src,dst,coverage])set(b,m,roles.get(b));let donorCapture=null;if(active()&&rows.length<cap){try{donorCapture=diffuseDonors(src,coverage,m,radius,knight)}catch(error){errors.push({op:{...op},stage:'diffuse-donors',error:String(error)})}}return call(original,this,args,'diffuse',{src,coverage},{dst},{x0,y0,S,tw,th,radius,knight,requiredHaloCells:Math.max(1,Math.round(radius/S))*(knight?2:1),inputHaloCaptured:!!donorCapture,donorCapture})});
  wrap(passes,'pigmentColor',function(original,args){const[out,deposit,tau]=args;if(!maps.has(out))set(out,maps.get(deposit),'pigmentColor-derived');return call(original,this,args,'pigmentColor',{deposit},{out},{tau:[...tau]})});
  if(typeof passes.costDomainStep==='function')wrap(passes,'costDomainStep',function(original,args){const[out,source,rect,band,stride,packed]=args;if(!maps.has(out))set(out,maps.get(source),'cost-domain-derived');return call(original,this,args,'costDomain',{source},{out},{rect:[...rect],band,stride,packed})});
  wrap(prototype,'copyTo',function(original,args){const[dst]=args;if(!maps.has(dst)&&dst.width===this.width&&dst.height===this.height)set(dst,maps.get(this),'copy-derived');return call(original,this,args,'copy',{source:this},{dst},{whole:true})});
  wrap(prototype,'copyRegionInto',function(original,args){const[dst,sx,sy,dx,dy,w,h]=args;if(!maps.has(dst))set(dst,copiedFrame(maps.get(this),dst,sx,sy,dx,dy),'copy-region-derived');return call(original,this,args,'copyRegion',{source:this},{dst},{sx,sy,dx,dy,w,h})});
  if(typeof prototype.clear==='function')wrap(prototype,'clear',function(original,args){return call(original,this,args,'clear',{previousOutput:this},{out:this},{args:args.map(primitive)})});
  if(typeof ctx.pool==='function'){const pool=ctx.pool();if(pool&&typeof pool.acquire==='function')wrap(pool,'acquire',function(original,args){const b=original.apply(this,args);maps.delete(b);roles.delete(b);return b})}
  return {begin(operation){op={id:operation.id,seq:operation.seq,type:operation.type};ordinal=0},end(){op=null},rows,summary(){return{enabled:true,point,ids,cap,rows:rows.length,truncated,vectorTruncated,errors,incomplete:truncated||vectorTruncated||errors.length>0,scope:'All covered pass calls; unknown texture inputs/unmapped frames explicit, NOT complete shader-input equality'}},dispose(){for(const restore of undo.reverse())restore();op=null}};
}
