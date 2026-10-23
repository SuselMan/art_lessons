// Performance-only; native stroke helper owns rAF sampling. No passive trace/readbacks.
import {writeFileSync,mkdirSync}from'node:fs';import{resolve}from'node:path';import{pathToFileURL}from'node:url';
const root=process.env.WC_RELEASE_ROOT;if(!root)throw Error('Isolated root required');
const{ev,joinAndInstall}=await import(pathToFileURL(resolve(root,'apps/web/scripts/devices/bridge.mjs')));
const[room,...args]=process.argv.slice(2),peers=args.map(x=>x.split('='));if(!room||peers.length!==2)throw Error('Two peers required');
const out=process.env.WC_QA_OUT??'temp/firstop-perf';mkdirSync(out,{recursive:true});const report={source:process.env.WC_QA_HEAD,room,scope:'native rAF logical same-GPU two peers; no canonical pixel or crossGPU claim',strokes:[]};const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2));const delay=ms=>new Promise(r=>setTimeout(r,ms));
const state=id=>ev(id,`const E=window.__engine;return{idle:!E._settle&&!E._opQueue.length&&!E._rebuildJobs.size&&!E._pendingRebuilds.size&&!E._washReveals.size,entries:E._log.entries.map(e=>({id:e.op.id,type:e.op.type,gesture:e.op.strokeId,state:e.state,pending:!!e.pending,seq:e.serverSeq})),operations:JSON.parse(JSON.stringify(E.getOperations())),gl:E.gl.getError(),lost:E.gl.isContextLost()};`);
const wall=setTimeout(()=>{report.timeout=true;save();process.exit(124)},160000);
try{
 for(const[,id]of peers){await joinAndInstall(id,room);await ev(id,'await window.__engine.paperReady();return true');}
 for(const[peer,preset]of[[peers[0],'normal:100:0:PB29:round'],[peers[1],'normal:0:15:PB29:round']]){
  const before=await state(peer[1]);if(before.lost||before.gl)throw Error('GL preflight');const known=new Set(before.entries.map(e=>e.id));
  await ev(peer[1],`return window.__mt.setup(${JSON.stringify({preset,size:80,color:[.3,.12,.6]})})`);
  // No concurrent bridge polls or GL queries until this native rAF measurement returns.
  const raw=await ev(peer[1],`return await window.__mt.stroke({pts:[[.3,.4],[.7,.4]],ms:900})`,90000);
  const row={peer:peer[0],preset,frames:typeof raw==='string'?JSON.parse(raw):raw};report.strokes.push(row);save();
  const limit=Date.now()+35000;let states;do{states=await Promise.all(peers.map(([,id])=>state(id)));if(states.every(s=>s.idle)&&JSON.stringify(states[0].operations)===JSON.stringify(states[1].operations))break;await delay(200)}while(Date.now()<limit);
  row.after=states;row.actualStrokeEntries=states[peers.indexOf(peer)].entries.filter(e=>e.type==='stroke'&&!known.has(e.id));save();
  if(!row.actualStrokeEntries.length||row.actualStrokeEntries.some(e=>e.pending||!Number.isInteger(e.seq))||states.some(s=>s.gl||s.lost||!s.idle)||JSON.stringify(states[0].operations)!==JSON.stringify(states[1].operations))throw Error('Actual gesture/serverACK/journal/idle guard failed');
 }
}finally{clearTimeout(wall);save()}
