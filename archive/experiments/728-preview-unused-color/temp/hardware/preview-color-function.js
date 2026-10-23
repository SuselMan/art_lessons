(async function(input){
 const {PencilEngine}=await import(input.moduleURL),result={scope:'same immutable native PointerData tape; diagnostic readback, not FPS',captures:[],census:[],journal:[]};let e,c,manualScratch;
 const raf=()=>new Promise(r=>requestAnimationFrame(r));
 const hash=async a=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',a))].map(x=>x.toString(16).padStart(2,'0')).join('');
 try{
 c=document.createElement('canvas');c.width=1280;c.height=900;c.style.cssText='width:1280px;height:900px';document.body.append(c);
 e=new PencilEngine(c,{pageWidth:1754,pageHeight:2480,paper:'fine',onLocalOperation:o=>result.journal.push(structuredClone(o))});window.__previewColorEngine=e;
 e.setBaseLayers(['layer-1']);e.setCompositeOrder([{id:'layer-1',opacity:1,blendMode:'normal'}]);e.setActiveLayer('layer-1');await e.paperReady();e.setLocked(false);
 // Identical test-only IDs keep codec payload and material seed comparison meaningful.
 let sid=null,wid=null,n=0;Object.defineProperty(e,'_strokeId',{configurable:true,get:()=>sid,set:v=>{sid=v?'preview-color-stroke-'+(++n):null}});Object.defineProperty(e,'_washId',{configurable:true,get:()=>wid,set:v=>{wid=v?'preview-color-wash':null}});
 const idle=async()=>{const end=performance.now()+90000;while(e._settle||e._wcCanonical.pending||e._opQueue.length||e._rebuildJobs.size||e._pendingRebuilds.size||e._washReveals.size){if(performance.now()>end)throw Error('idle90');await raf()}};
 const bytes=b=>{const a=new Uint8Array(b.width*b.height*4);e.gl.bindFramebuffer(e.gl.FRAMEBUFFER,b.fbo);e.gl.readPixels(0,0,b.width,b.height,e.gl.RGBA,e.gl.UNSIGNED_BYTE,a);e.gl.bindFramebuffer(e.gl.FRAMEBUFFER,null);return a};
 const png=(a,w,h)=>{const x=document.createElement('canvas');x.width=w;x.height=h;const flipped=new Uint8ClampedArray(a.length);for(let y=0;y<h;y++)flipped.set(a.subarray(y*w*4,(y+1)*w*4),(h-y-1)*w*4);x.getContext('2d').putImageData(new ImageData(flipped,w,h),0,0);const s=x.toDataURL('image/png').split(',')[1];x.width=x.height=0;return s};
 let job=0,fieldDraws=0,tileDraws=0,scale=1;const sourceEntries=new Map();
 const passes=e._watercolorPasses,pc=passes.pigmentColor,resample=passes.wcResample,prepare=e._settlePlan.prepare;
 passes.pigmentColor=function(...a){if(a[0].width===1536)fieldDraws++;else tileDraws++;return pc.apply(this,a)};
 passes.wcResample=function(...a){scale=a[8]===.5?2:scale;return resample.apply(this,a)};
 e._settlePlan.prepare=function(...a){const id=++job,callback=a[10];for(const t of a[1])sourceEntries.set(t.buffer,{scratch:a[0],tile:t});if(typeof callback==='function')a[10]=function(tile,P,C,V){if(result.captures.length>=6)return callback(tile,P,C,V);const previousField=fieldDraws,previousTile=tileDraws;const rec={job:id,next:e._settle?.next??null,target:[tile.originX,tile.originY],scale,fieldDraws:previousField,tileDraws:previousTile,P:bytes(P),C:C?bytes(C):null,coverage:bytes(V),size:[P.width,P.height]};result.captures.push(rec);return callback(tile,P,C,V)};const out=prepare.apply(this,a);result.census.push({job:id,owner:a[13],paints:(a[12]??a[0]).paints.size,ops:out?.ops.length});return out};
 e.setTool('watercolor');e.setPencil('normal:100:100:PB29:round');e.setColor([.22,.35,.62]);e.setSize(input.kind==='S1'?48:400);
 // No shader/default flag substitution. The exact PointerData delivery batches are supplied by caller.
 if(input.kind==='mixed'){
 const {RibbonStrokeScratch}=await import(input.moduleURL.replace('/index.ts','/src/buffers/RibbonStrokeScratch.ts'));
 const scratch=manualScratch=new RibbonStrokeScratch(e._ribbonScratchPool,true,true),target=e._layers.get('layer-1');
 for(let i=0;i<input.dabTapes.length;i++)e._paintDabs(target,structuredClone(input.dabTapes[i]),'watercolor','normal:100:100:PB29:round',i?[.6,.1,.2]:[.22,.35,.62],e._userId,undefined,scratch,'mixed-fixture-'+i,'mixed-fixture-wash','',[.3,.7]);e._finishRibbonStroke(scratch,true,true,true);await idle()
 }else for(const row of input.tape){e[row.method](structuredClone(row.sample));if(row.yield)await raf()}
 await idle();const material=[];for(const {scratch,tile} of sourceEntries.values()){const entry=scratch.peek(tile.buffer);for(const k of ['inkLoad','inkColor','inkDry','colorDry','coverage','solventLoad'])if(entry?.[k]){const a=bytes(entry[k]);material.push({k,origin:[tile.originX,tile.originY],sha:await hash(a),nonzero:a.reduce((n,v,i)=>n+(i%4===3&&v>0),0),size:[entry[k].width,entry[k].height]})}}result.materialBeforeDry=material;result.afterNative=await hash(await (await e.exportPNG(true)).arrayBuffer());
 e.appendOperation({id:'preview-color-Dry',type:'paper_dry',timestamp:1791357000000,userId:e._userId});await idle();
 const final=await e.exportPNG(true);result.finalPNG=[...new Uint8Array(await final.arrayBuffer())];result.finalSHA=await hash(await final.arrayBuffer());
 for(const r of result.captures){for(const k of ['P','C','coverage'])if(r[k]){r[k+'SHA']=await hash(r[k]);r[k+'PNG']=png(r[k],...r.size);r[k+'Nonzero']=r[k].reduce((n,v,i)=>n+(i%4===3&&v>0),0);delete r[k]}}
 result.gl=e.gl.getError();result.lost=e.gl.isContextLost();result.flags={debug:e._debug,phase:e._settlePlan.diagnosticPlateauPhase,add:e._settlePlan.diagnosticAdditiveZeroFaces,cost:e._settlePlan.diagnosticCostDomainPaths,split:e._settlePlan.splitQuanta};result.counts={fieldDraws,tileDraws};
 }catch(error){result.error=String(error)}finally{manualScratch?.destroy();e?.destroy();c?.remove();delete window.__previewColorEngine;result.engineClosed=true}return result;
})
