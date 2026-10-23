// HARNESS ONLY; no pixel/GL diagnostic calls. Run only after root GPU grant.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.WC_RELEASE_ROOT;if(!root)throw Error('Explicit isolated WC_RELEASE_ROOT required');
const {ev,joinAndInstall}=await import(pathToFileURL(resolve(root,'apps/web/scripts/devices/bridge.mjs')));
const [room,...args]=process.argv.slice(2),peers=args.map(x=>x.split('='));
if(!room||peers.length!==2)throw Error('room A=bridge B=bridge required');
const out=resolve(process.env.WC_QA_OUT??'temp/stitch-passive');mkdirSync(out,{recursive:true});
const script=readFileSync(new URL('./deferred-stitch-passive.js',import.meta.url),'utf8');
const report={source:process.env.WC_QA_HEAD,scope:'passive chronology, not pixel equality',room};
const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const state=id=>ev(id,`const E=window.__engine;return {idle:!E._settle&&!E._opQueue.length&&!E._peerLiveStrokes.size,operations:JSON.parse(JSON.stringify(E.getOperations())),trace:window.__wcStitchTrace.report()};`);
const timer=setTimeout(()=>{report.timeout=true;save();process.exit(124)},170000);
try {
 for(const [,id]of peers){await joinAndInstall(id,room);await ev(id,'await window.__engine.paperReady();return true');await ev(id,script);}
 for(const [peer,preset]of [[peers[0],'normal:100:0:PB29:round'],[peers[1],'normal:0:15:PB29:round']]){
  await ev(peer[1],`return window.__mt.setup(${JSON.stringify({preset,size:80,color:[.3,.12,.6]})})`);
  await ev(peer[1],`return await window.__mt.stroke({pts:[[.3,.4],[.7,.4]],ms:900})`,90000);
  const deadline=Date.now()+35000;let states;
  do{states=await Promise.all(peers.map(([,id])=>state(id)));if(states.every(s=>s.idle)&&JSON.stringify(states[0].operations)===JSON.stringify(states[1].operations))break;await delay(200)}while(Date.now()<deadline);
  report[preset]=states;save();if(!states.every(s=>s.idle)||JSON.stringify(states[0].operations)!==JSON.stringify(states[1].operations))throw Error('Actual journals/idle barrier failed');
 }
}finally{
 clearTimeout(timer);report.final=await Promise.all(peers.map(([,id])=>state(id).catch(e=>({error:String(e)}))));
 await Promise.allSettled(peers.map(([,id])=>ev(id,'window.__wcStitchTrace?.dispose();return true')));save();
}
