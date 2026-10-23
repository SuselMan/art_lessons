// AsyncFunction body args fixture, withDry. Same recorded IDs/timestamps/dabs;
// no timestamp rewrite, no fresh server snapshot, no source modifications.
const {PencilEngine}=await import('/src/engine/index.ts');
const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;document.body.append(canvas);
const e=new PencilEngine(canvas,{pageWidth:fixture.width,pageHeight:fixture.height,paper:'fine',userId:'historical-barrier-oracle'});
try{
 await e.paperReady();e.initLayer('layer-1');e.setActiveLayer('layer-1');e.setCompositeOrder([{id:'layer-1',opacity:1}]);
 const idle=async()=>{const start=performance.now();while(e._settle||e._opQueue.length||e._rebuildJobs.size||e._pendingRebuilds.size){if(performance.now()-start>90000)throw Error('replay idle90s');await new Promise(r=>setTimeout(r,20))}};
 const flagNames=['diagnosticSegmentDelivery','diagnosticPigmentRecord','diagnosticSharedFluid','diagnosticLandingReservoir','diagnosticWaterPolicy','diagnosticForeignSolvent','diagnosticSolventField','diagnosticCanonicalSettleRadius','diagnosticLandingPolicy'];const flags=Object.fromEntries(flagNames.map(k=>[k,e._ribbonPainter[k]]));
 const sources=[];const sourceKeys=new Set();let activeGesture;const work=e._ribbonDabsWork.bind(e);e._ribbonDabsWork=function*(...args){const previous=activeGesture;activeGesture=args[7];try{return yield* work(...args)}finally{activeGesture=previous}};
 const paint=e._ribbonPainter.paint.bind(e._ribbonPainter);e._ribbonPainter.paint=(...args)=>{const scratch=args[6];const op=fixture.withDry.find(o=>o.type==='stroke'&&o.strokeId===activeGesture);if(op){const item={op:op.id,seq:op.seq,gesture:activeGesture,donors:(scratch?.foreignSources??[]).flatMap(s=>s.chunks?.map(c=>c.id)??[])};const key=JSON.stringify(item);if(!sourceKeys.has(key)){sourceKeys.add(key);sources.push(item)}}return paint(...args)};

 for(const op of (withDry?fixture.withDry:fixture.withoutDry)){e.appendOperation(op,'remote');await idle()}
 await idle();const blob=await e.exportPNG(true);if(!blob)throw Error('empty export');const bytes=new Uint8Array(await blob.arrayBuffer());const bitmap=await createImageBitmap(blob),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);bitmap.close();const rgba=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let painted=0;for(let k=3;k<rgba.length;k+=4)if(rgba[k])painted++;c.width=c.height=0;let binary='';for(let k=0;k<bytes.length;k+=32768)binary+=String.fromCharCode(...bytes.subarray(k,k+32768));return{png:btoa(binary),painted,paper:'fine',gl:e.gl.getError(),lost:e.gl.isContextLost(),flags,sources,operations:JSON.parse(JSON.stringify(e.getOperations()))}
}finally{e.destroy();canvas.remove()}
