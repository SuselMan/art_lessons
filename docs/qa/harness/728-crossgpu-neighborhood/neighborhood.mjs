import {diffusionStencilCells,uploadViewDescriptor} from './stencil.mjs';
/** QA-only synchronous tiny readback. No operators, textures or uniforms changed. */
export function worldRead(meta, point, radius = 2) {
  const [wx, wy] = point;
  const topX = Math.floor((wx + 0.5 - meta.x0) / meta.S);
  const topY = Math.floor((wy + 0.5 - meta.y0) / meta.S);
  const center = [topX, meta.h - 1 - topY];
  if (center[0] < 0 || center[1] < 0 || center[0] >= meta.w || center[1] >= meta.h) return null;
  const x = Math.max(0, center[0] - radius), y = Math.max(0, center[1] - radius);
  return {x, y, w:Math.min(meta.w - x, center[0] + radius + 1 - x), h:Math.min(meta.h - y, center[1] + radius + 1 - y), center};
}
export function installNeighborhood(e, {point=[994,1231], ids=['Gq9CPrzxWh','ytlRBmw3Tg'], cap=512, paperBytes=null, paperResolution=2048, paperChannels=2}={}) {
  const gl=e.gl, passes=e._watercolorPasses, plan=e._settlePlan, ctx=plan.ctx;
  if (!passes?.diffuseStep || !passes?.fieldOp || !plan?.prepare || !ctx?.fieldFor) throw Error('actual QA seam absent');
  const rows=[], maps=new WeakMap(), identity=new WeakMap();let nextID=1, current=null, preparing=null, truncated=false;
  const id=o=>{if(!o)return null;if(!identity.has(o))identity.set(o,nextID++);return identity.get(o)};
  const originals={prepare:plan.prepare, fieldFor:ctx.fieldFor, diffuse:passes.diffuseStep, fieldOp:passes.fieldOp};
  function paper(m,radius,knight){
    const texture=passes.ctx?.paperTex?.();let sampler=null;
    if(texture){const previous=gl.getParameter(gl.TEXTURE_BINDING_2D);try{gl.bindTexture(gl.TEXTURE_2D,texture);sampler={min:gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER),mag:gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER),wrapS:gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S),wrapT:gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T)}}finally{gl.bindTexture(gl.TEXTURE_2D,previous)}}
    if(!paperBytes)return {available:false,scope:"raw CPU height plane not supplied; no actual GPU height claim"};
    const r=worldRead(m,point);if(!r)return {outside:true};const scale=m.paperScale;
    const sample=(dx,dy)=>{const u=((r.center[0]+.5+dx+m.x0/m.S)/(m.paper.w/m.S))*scale;const v=((r.center[1]+.5+dy-(m.y0/m.S+m.h))/(m.paper.h/m.S))*scale;const x=u*paperResolution-.5,y=v*paperResolution-.5,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;const at=(a,b)=>paperBytes[(((b%paperResolution+paperResolution)%paperResolution)*paperResolution+((a%paperResolution+paperResolution)%paperResolution))*paperChannels];const bytes=[at(ix,iy),at(ix+1,iy),at(ix,iy+1),at(ix+1,iy+1)];return {offset:[dx,dy],uv:[u,v],texel:[ix,iy],bytes,heightDouble:((1-fy)*((1-fx)*bytes[0]+fx*bytes[1])+fy*((1-fx)*bytes[2]+fx*bytes[3]))/255};};
    const step=Math.max(1,Math.round(radius/m.S)),dirs=knight?[[2,1],[-2,-1],[1,2],[-1,-2],[-1,2],[1,-2],[-2,1],[2,-1]]:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];return {scope:"raw uploaded input bytes + intended CPU bilinear; not measured GPU interpolation",resolution:paperResolution,sampler,samples:[sample(0,0),...dirs.map(([x,y])=>sample(x*step,y*step))]};
  }
  function read(b,m){
    if(!b?.fbo)return null;if(b.width!==m.w||b.height!==m.h)return {unmapped:true,buffer:id(b),size:[b.width,b.height],reason:"not same physical field dimensions"};const r=worldRead(m,point);if(!r)return {outside:true,buffer:id(b),size:[b.width,b.height]};
    const old=gl.getParameter(gl.FRAMEBUFFER_BINDING),bytes=new Uint8Array(r.w*r.h*4);
    try{gl.bindFramebuffer(gl.FRAMEBUFFER,b.fbo);gl.readPixels(r.x,r.y,r.w,r.h,gl.RGBA,gl.UNSIGNED_BYTE,bytes)}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,old)}
    return {buffer:id(b),size:[b.width,b.height],read:r,bytes:Array.from(bytes)};
  }
  function readDonors(b,m,cells){
    if(!b?.fbo||b.width!==m.w||b.height!==m.h)return {known:false,reason:'missing or unmapped actual input',buffer:id(b)};
    const old=gl.getParameter(gl.FRAMEBUFFER_BINDING),patches=[];
    try{gl.bindFramebuffer(gl.FRAMEBUFFER,b.fbo);for(const c of cells){if(c.outside){patches.push({cell:c.cell,outside:true});continue}const x=Math.max(0,c.cell[0]-2),y=Math.max(0,c.cell[1]-2),w=Math.min(m.w-x,c.cell[0]+3-x),h=Math.min(m.h-y,c.cell[1]+3-y);const bytes=new Uint8Array(w*h*4);gl.readPixels(x,y,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);patches.push({cell:c.cell,uv:c.uv,read:[x,y,w,h],bytes:Array.from(bytes)})}}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,old)}
    return {known:true,buffer:id(b),patches,maxPixels:225};
  }
  function donorPaper(cells){
    if(!ArrayBuffer.isView(paperBytes)||paperBytes.byteLength!==paperResolution*paperResolution*paperChannels)return {known:false,reason:'no exact supplied LA CPU view'};
    return {known:true,provenance:uploadViewDescriptor(paperBytes),uploadBindingVerified:false,scope:'supplied CPU view; actual GPU height interpolation and upload binding not proven',samples:cells.map(c=>c.outside?{outside:true,cell:c.cell}:{cell:c.cell,paperUV:c.paperUV,fraction:c.fraction,paperCells:c.paperCells,heightBytes:c.paperCells.map(([x,y])=>paperBytes[(y*paperResolution+x)*paperChannels])})};
  }
  function record(stage,m,buffers,extra={}){
    if(!current||!ids.includes(current.id)||!m)return;if(rows.length>=cap){truncated=true;return}
    rows.push({ordinal:rows.length,op:{...current},stage,at:performance.now(),meta:{...m},fields:Object.fromEntries(Object.entries(buffers).map(([k,b])=>[k,read(b,m)])),...extra});
  }
  ctx.fieldFor=function(w,h){const f=originals.fieldFor.call(this,w,h);if(preparing?.bounds){const b=preparing.bounds,S=(b.maxX-b.minX)/w;if(!Number.isFinite(S)||S<=0||Math.abs(S-(b.maxY-b.minY)/h)>1e-9)throw Error('actual field scale mismatch');const m={x0:b.minX,y0:b.minY,S,w:f.w,h:f.h,requested:[w,h],paper:this.paperWorldSize(),paperScale:e._paper.scale};for(const k of ['a','b','c','ca','cb','cc','coverage','mask','pressure','band'])maps.set(f[k],m);preparing.field=f;preparing.meta=m;}return f};
  plan.prepare=function(...args){const scratch=args[0],old=scratch.noteStorageBounds;const previous=preparing;preparing={op:current};scratch.noteStorageBounds=function(bounds){preparing.bounds={...bounds};return old.call(this,bounds)};try{return originals.prepare.apply(this,args)}finally{scratch.noteStorageBounds=old;preparing=previous}};
  passes.fieldOp=function(...args){const[out,a,b,mode]=args,m=maps.get(out)||maps.get(a)||maps.get(b);const selected=[0,1,6,7,14,15,16,19].includes(mode);if(selected)record('field-'+mode+'-before',m,{a,b}, {mode,output:id(out)});const result=originals.fieldOp.apply(this,args);if(selected)record('field-'+mode+'-after',m,{out},{mode,inputs:[id(a),id(b)]});return result};
  passes.diffuseStep=function(...args){const[f,x0,y0,S,tw,th,src,dst,radius,knight,gate,density,solvent]=args,m={x0,y0,S,w:f.w,h:f.h,paper:{w:tw,h:th},paperScale:e._paper.scale};const primary=src===density;
    const cells=diffusionStencilCells(m,point,radius,knight,paperResolution);const selected=current&&ids.includes(current.id)&&rows.length<cap;const donors=selected?{ink:readDonors(src,m,cells),coverage:readDonors(gate,m,cells)}:null;record('diffuse-before',m,{src,coverage:gate},{radius,knight,primary,src:id(src),dst:id(dst),unusedArguments:{density:{bound:false,buffer:id(density)},solvent:{bound:false,buffer:id(solvent)},cost:{bound:false}},cells,donors,paperDonors:selected?donorPaper(cells):null,externalUpload:{known:false,reason:'no exact bound external upload provenance captured'},paper:paper(m,radius,knight)});
    const result=originals.diffuse.apply(this,args);
    record('diffuse-after',m,{dst},{radius,knight,primary,src:id(src),dst:id(dst)});return result;
  };
  return {begin(op){current={id:op.id,seq:op.seq,type:op.type}},end(){current=null},rows,summary(){return{rows:rows.length,cap,truncated,point,ids}},dispose(){plan.prepare=originals.prepare;ctx.fieldFor=originals.fieldFor;passes.diffuseStep=originals.diffuse;passes.fieldOp=originals.fieldOp;current=null}};
}
