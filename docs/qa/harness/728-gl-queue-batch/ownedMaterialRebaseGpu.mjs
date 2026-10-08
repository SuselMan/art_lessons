/** Diagnostic actual GL source rebase, no Room/morph/canonical-settle claim. */
const roles=['presentation','original','coverage','coverageFilm','pigmentLoad','pigmentBase','pigmentFilm','colourLoad','colourBase','colourFilm','solventLoad','solventBase','solventFilm'];
const inherited=['presentation','original','coverage','pigmentLoad','colourLoad','solventLoad'];
export function compareRebaseFields(before,rebased,fresh){
 if([before,rebased,fresh].some(fields=>fields.length!==13||new Set(fields.map(f=>f.role)).size!==13||fields.some(f=>!roles.includes(f.role)||f.width!==1024||f.height!==1024||f.bytes!==4194304||!f.sha)))throw Error('All thirteen real1024 field roles required');
 const b=new Map(before.map(f=>[f.role,f])),reference=new Map(fresh.map(f=>[f.role,f]));
 const differences=rebased.filter(f=>f.sha!==reference.get(f.role).sha).map(f=>f.role),changed=rebased.filter(f=>f.sha!==b.get(f.role).sha).map(f=>f.role);
 const meaningful=['presentation','coverage','pigmentLoad','colourLoad'].every(role=>rebased.find(f=>f.role===role).nonzero>0);
 return {exact:differences.length===0,differences,changed,negativeDetected:changed.includes('presentation')&&changed.includes('coverage'),meaningful};
}
export async function runOwnedMaterialRebaseGpu(){
 const [{PencilEngine},{RibbonStrokeScratch},{ribbonProfileFor},{RibbonStrokePainter:OwnerPainter},{PrewarmedGlOwnerPool},{OwnedGlPreparedSource}]=await Promise.all([
 import('/src/engine/index.ts'),import('/src/engine/src/buffers/RibbonStrokeScratch.ts'),import('/src/engine/src/dabs/ribbonProfile.ts'),import('../../../../temp/owner-fifo-runtime/OwnerRibbonStrokePainter.ts'),import('./PrewarmedGlOwnerPool.ts'),import('./OwnedGlPreparedSource.ts')]);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;document.querySelector('#surface').replaceChildren(canvas);
 const e=new PencilEngine(canvas,{paper:'fine',pageWidth:1024,pageHeight:1024,userId:'owned-material-rebase-qa'});window.__ownedMaterialRebaseEngine=e;
 let pool;const owners=[],scratches=[],requests=[];
 const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const capture=async fields=>{const result=[];for(const role of roles){const f=fields[role],bytes=f.readPixels();let nonzero=0;for(const b of bytes)nonzero+=b!==0;result.push({role,width:f.width,height:f.height,bytes:bytes.length,nonzero,sha:await hash(bytes)})}return result};
 try{
 await e.paperReady();e.initLayer('L');if(!e._minmaxExt)throw Error('Actual MAX capability required');
 const ctx=e._ribbonPainter.ctx,painter=new OwnerPainter(ctx);for(const key of Object.keys(e._ribbonPainter))if(typeof e._ribbonPainter[key]==='boolean'||typeof e._ribbonPainter[key]==='string')painter[key]=e._ribbonPainter[key];
 painter.diagnosticSegmentDelivery='combined';painter.diagnosticSolventField=true;painter.diagnosticForeignSolvent=false;painter.diagnosticPigmentRecord=true;
 const name='normal:100:100:PB29:round',preset=e._resolvePreset('watercolor',name),profile=ribbonProfileFor('watercolor',name,0);
 const prepare=(points,color,seed)=>{const scratch=new RibbonStrokeScratch(e._ribbonScratchPool,true,true);scratches.push(scratch);const chunks=[],dabs=points.map(([x,y],i)=>({x,y,size:400-i*13,pressure:i===points.length-1?.13:.8,aspectRatio:1,angle:.7,opacity:1,tiltX:0,tiltY:0,t:i*40}));
 for(const _ of painter.paint(e._layers.get('L'),dabs,preset,name,profile,color,scratch,undefined,'ffff',seed,true,0,{waterOnly:false,segmented:false,deferMaterial:request=>{requests.push(request);const r=request.typedSource;if(!r?.commands.length)throw Error('Actual captured source absent');chunks.push({commands:r.commands,rect:r.rect,film:true,waterOnly:false,composite:r.composite})}}))void _;
 if(!chunks.length||!chunks.some(c=>c.commands.some(command=>command.kind==='ribbon')))throw Error('Meaningful actual ribbon commands absent');return chunks};
 const predecessorChunks=prepare([[270,360],[380,430],[470,400],[550,380]],[.1,.45,.2],[3,5]),youngerChunks=prepare([[420,480],[480,400],[570,440],[630,420]],[.25,.1,.5],[7,11]);
 const context={gl:()=>e.gl,stamps:()=>e._stamps,paperTex:()=>e._paperTex,quadBuf:()=>e._quadBuf,minmaxExt:()=>e._minmaxExt};
 pool=new PrewarmedGlOwnerPool(e.gl,3,156*1024*1024);const empty=Object.fromEntries(roles.map(role=>[role,null]));
 const make=(initial,retain=false)=>{const lease=pool.take(initial);if(!lease)throw Error('Prewarmed lease unavailable');const source=new OwnedGlPreparedSource({lease,context,ribbon:e._ribbonPasses,watercolor:e._watercolorPasses,retainForRebase:retain,ownerToken:retain?{layerId:'L',gesture:2}:undefined});owners.push(source);return{source,lease}};
 const predecessor=make(empty),retained=make(empty,true);for(const chunk of predecessorChunks)predecessor.source.paint(chunk);for(const chunk of youngerChunks)retained.source.paint(chunk);
 const before=await capture(retained.lease.fields),fields=Object.fromEntries(inherited.map(role=>[role,predecessor.lease.fields[role]]));
 const initial={...empty,...fields},fresh=make(initial);for(const chunk of youngerChunks)fresh.source.paint(chunk);
 retained.source.rebaseFromPredecessor({ownerToken:retained.source.rebaseToken,layerId:'L',predecessorGesture:1,expectedEpoch:0,nextEpoch:1,fields});
 const rebased=await capture(retained.lease.fields),reference=await capture(fresh.lease.fields),comparison=compareRebaseFields(before,rebased,reference),glError=e.gl.getError(),lost=e.gl.isContextLost();
 return{scope:'Actual prepared GL source commands versus fresh late-bound owner. Predecessor is a source-material fixture; no canonical settle/Room/morph proof.',comparison,before,rebased,reference,epoch:retained.source.epoch,retainedPayloadBytes:retained.source.retainedPayloadBytes,commands:youngerChunks.reduce((n,c)=>n+c.commands.length,0),prewarmedBytes:pool.bytes,glError,lost,valid:comparison.exact&&comparison.negativeDetected&&comparison.meaningful&&!glError&&!lost};
 }finally{if(!e.gl.isContextLost())e.gl.finish();for(const owner of owners)owner.retire();pool?.disposeAfterFence();for(const request of requests)request.cancel(false);for(const scratch of scratches)scratch.destroy();e.destroy();window.__ownedMaterialRebaseEngine=null;canvas.remove()}
}
