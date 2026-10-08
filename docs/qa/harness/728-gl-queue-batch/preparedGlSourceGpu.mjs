/* Source-only real GPU comparison. No canonical finish/Room/ownership throughput claim. */
export async function runPreparedGlSourceGpu(input){
 if(typeof input.prepared!=='boolean'||!['round','chisel'].includes(input.nib)||typeof input.film!=='boolean'||typeof input.segment!=='boolean')throw Error('Explicit fixture parameters required');
 const [{PencilEngine},{RibbonStrokeScratch},{ribbonProfileFor},{createCanonicalStrokeChunkState,prepareCanonicalStrokeChunk},{drawPreparedGlSource}]=await Promise.all([
  import('/src/engine/index.ts'),import('/src/engine/src/buffers/RibbonStrokeScratch.ts'),import('/src/engine/src/dabs/ribbonProfile.ts'),import('/src/engine/src/dabs/canonicalStrokeChunk.ts'),import('./PreparedGlSourceDraw.ts')]);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;document.querySelector('#surface').replaceChildren(canvas);
 const e=new PencilEngine(canvas,{paper:'fine',pageWidth:1024,pageHeight:1024,userId:'prepared-source-qa'});window.__preparedSourceEngine=e;
 let scratch;const restores=[];
 const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 try{
  await e.paperReady();e.initLayer('L');const painter=e._ribbonPainter,ctx=painter.ctx,ribbon=e._ribbonPasses,rctx=ribbon.ctx;
  painter.diagnosticSegmentDelivery=input.segment?'combined':false;painter.diagnosticSolventField=input.segment;painter.diagnosticForeignSolvent=false;painter.diagnosticPigmentRecord=true;
  if(input.film&&!ctx.minmaxExt())throw Error('Fixture MAX unavailable');if(!input.film){const old=ctx.minmaxExt;ctx.minmaxExt=()=>null;restores.push(()=>ctx.minmaxExt=old)}
  const name=`normal:100:100:PB29:${input.nib}`,preset=e._resolvePreset('watercolor',name),profile=ribbonProfileFor('watercolor',name,0),dabs=[[300,400],[390,470],[440,430],[520,420]].map(([x,y],i)=>({x,y,size:400-i*13,pressure:i===3?.13:.8,aspectRatio:input.nib==='chisel'?2:1,angle:.7,opacity:1,tiltX:0,tiltY:0,t:Math.floor(i/2)*40})),wetProfile='0f37',seed=[1,2];
  const commands=prepareCanonicalStrokeChunk(createCanonicalStrokeChunkState(),{dabs,preset,presetName:name,profile,color:[.2,.1,.5],wetProfile,strokeSeed:seed,tile:{originX:0,originY:0,buffer:{width:1024,height:1024}},film:input.film,segmentMode:input.segment?'combined':false,options:{diagnosticWaterPolicy:painter.diagnosticWaterPolicy,diagnosticSharedFluid:painter.diagnosticSharedFluid,diagnosticLandingReservoir:painter.diagnosticLandingReservoir,diagnosticLandingPolicy:painter.diagnosticLandingPolicy,diagnosticCanonicalSettleRadius:painter.diagnosticCanonicalSettleRadius,diagnosticSolventField:input.segment,diagnosticPigmentRecord:true}}).commands;
  if(input.negative){let changed=0;for(const c of commands)if(c.phase==='color'){const u=c.kind==='stamp'?c.stamp.uniforms:c.batch.uniforms;u.tau=u.tau.map(v=>v*.3);changed++}if(!changed)throw Error('Negative colour commands absent')}
  scratch=new RibbonStrokeScratch(e._ribbonScratchPool,true,true);let cursor=0,stamps=0,bands=0;
  const stamp=ctx.drawRibbonNibPass,band=ctx.drawRibbonBands;
  ctx.drawRibbonNibPass=(...args)=>{const c=commands[cursor++];if(!c||c.kind!=='stamp')throw Error('Canonical stamp order mismatch');stamps++;if(!input.prepared)return stamp.apply(ctx,args);const [dest,tile,,, ,,,own]=args;drawPreparedGlSource(c,dest,scratch.peek(tile.buffer).coverage,tile,rctx,ribbon,preset.hardness,own)};
  ctx.drawRibbonBands=(...args)=>{if(!args[2].length)return band.apply(ctx,args);const c=commands[cursor++];if(!c||c.kind!=='ribbon')throw Error('Canonical ribbon order mismatch');bands++;if(!input.prepared)return band.apply(ctx,args);drawPreparedGlSource(c,args[0],scratch.peek(args[1].buffer).coverage,args[1],rctx,ribbon,preset.hardness)};
  restores.push(()=>{ctx.drawRibbonNibPass=stamp;ctx.drawRibbonBands=band});
  for(const _ of painter.paint(e._layers.get('L'),dabs,preset,name,profile,[.2,.1,.5],scratch,undefined,wetProfile,seed))void _;
  if(cursor!==commands.length||stamps===0||bands===0)throw Error('Canonical input not fully consumed');
  const roles=['original','coverage','inkLoad','inkColor','inkBase','colorBase','strokeInk','strokeColor','solventLoad','solventBase','strokeSolvent'],fields=[];
  let tileCount=0;for(const [target,entry]of scratch.tileEntries()){if(tileCount++)throw Error('Bounded single tile exceeded');for(const role of ['target',...roles]){const b=role==='target'?target:entry[role];if(!b){fields.push({role,absent:true});continue}const bytes=b.readPixels();let nonzero=0;for(const v of bytes)nonzero+=v!==0;fields.push({role,width:b.width,height:b.height,bytes:bytes.length,nonzero,sha:await hash(bytes)})}}
  const glError=e.gl.getError();if(!tileCount||glError||e.gl.isContextLost()||!fields.some(f=>f.role==='inkLoad'&&f.nonzero)||!fields.some(f=>f.role==='coverage'&&f.nonzero))throw Error('Meaningful GPU fields/GL guard failed');
  return{input,scope:'Production source-only painter with captured canonical primitive binding; original clear/copy/sum/phase unchanged. NOT finish/Room/queued presentation proof.',commands:cursor,stamps,bands,fields,glError,lost:false};
 }finally{for(const restore of restores.reverse())restore();scratch?.destroy();e.destroy();window.__preparedSourceEngine=null;canvas.remove()}
}
