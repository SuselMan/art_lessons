// HARNESS ONLY; no pixel/GL diagnostic calls. Run only after root GPU grant.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.WC_RELEASE_ROOT;if(!root)throw Error('Explicit isolated WC_RELEASE_ROOT required');
const {ev,joinAndInstall}=await import(pathToFileURL(resolve(root,'apps/web/scripts/devices/bridge.mjs')));
const [room,...args]=process.argv.slice(2),peers=args.map(x=>x.split('='));
if(!room||peers.length!==2)throw Error('room A=bridge B=bridge required');
const out=resolve(process.env.WC_QA_OUT??'temp/stitch-passive');mkdirSync(out,{recursive:true});
const script=readFileSync(new URL('./deferred-stitch-firstop.js',import.meta.url),'utf8');
const report={source:process.env.WC_QA_HEAD,scope:'passive chronology, not pixel equality',room};
const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2));

const rawScript=`const E=window.__engine,gl=E.gl,roi={x:1006,y:894,w:256,h:128},bytes=new Uint8Array(roi.w*roi.h*4),previous=gl.getParameter(gl.FRAMEBUFFER_BINDING);try{for(const tile of E._layers.get('layer-1').allResident()){const x=Math.max(roi.x,tile.originX),y=Math.max(roi.y,tile.originY),r=Math.min(roi.x+roi.w,tile.originX+tile.buffer.width),b=Math.min(roi.y+roi.h,tile.originY+tile.buffer.height);if(r<=x||b<=y)continue;const w=r-x,h=b-y,a=new Uint8Array(w*h*4);gl.bindFramebuffer(gl.FRAMEBUFFER,tile.buffer.fbo);gl.readPixels(x-tile.originX,tile.buffer.height-(b-tile.originY),w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);for(let j=0;j<h;j++)bytes.set(a.subarray((h-1-j)*w*4,(h-j)*w*4),((y-roi.y+j)*roi.w+x-roi.x)*4);}}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,previous)}const digest=await crypto.subtle.digest('SHA-256',bytes);return {roi,sha256:[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join(''),nonzero:bytes.some(v=>v!==0),bytes:Array.from(bytes),gl:gl.getError(),lost:gl.isContextLost()};`;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const state=id=>ev(id,`const E=window.__engine;return {flags:Object.fromEntries(['diagnosticSegmentDelivery','diagnosticPigmentRecord','diagnosticSharedFluid','diagnosticLandingReservoir','diagnosticSolventField','diagnosticCanonicalSettleRadius','diagnosticLandingPolicy','diagnosticWaterPolicy','diagnosticForeignSolvent'].map(k=>[k,E._ribbonPainter[k]])),idle:!E._settle&&!E._opQueue.length&&!E._peerLiveStrokes.size,operations:JSON.parse(JSON.stringify(E.getOperations())),trace:window.__wcStitchTrace.report()};`);
const timer=setTimeout(()=>{report.timeout=true;save();process.exit(124)},170000);
try {
 for(const [,id]of peers){await joinAndInstall(id,room);await ev(id,'await window.__engine.paperReady();return true');await ev(id,`window.__wcStitchSourceStamp=${JSON.stringify(process.env.WC_QA_HEAD??'UNSTAMPED')};return true`);await ev(id,script);}
 for(const [peer,preset]of [[peers[0],'normal:100:0:PB29:round'],[peers[1],'normal:0:15:PB29:round']]){
  await ev(peer[1],`return window.__mt.setup(${JSON.stringify({preset,size:80,color:[.3,.12,.6]})})`);
  await ev(peer[1],`return await window.__mt.stroke({pts:[[.3,.4],[.7,.4]],ms:900})`,90000);
  const deadline=Date.now()+35000;let states;
  do{states=await Promise.all(peers.map(([,id])=>state(id)));if(states.every(s=>s.idle)&&JSON.stringify(states[0].operations)===JSON.stringify(states[1].operations))break;await delay(200)}while(Date.now()<deadline);
  report[preset]=states;report[preset+'-raw']=await Promise.all(peers.map(([,id])=>ev(id,rawScript)));save();if(!states.every(s=>s.idle)||JSON.stringify(states[0].operations)!==JSON.stringify(states[1].operations))throw Error('Actual journals/idle barrier failed');
 }
 report.beforeRejoin=await Promise.all(peers.map(([,id])=>ev(id,rawScript)));save();
 await ev(peers[0][1],"setTimeout(()=>__devNavigate(location.pathname+'?qa='+Date.now()),0);return true");await delay(1000);await joinAndInstall(peers[0][1],room);await ev(peers[0][1],'await window.__engine.paperReady();window.__wcStitchSourceStamp="rejoin";return true');await ev(peers[0][1],script);
 const limit=Date.now()+30000;while(Date.now()<limit){const a=await state(peers[0][1]);if(a.idle)break;await delay(200)}
 report.afterRejoin=await Promise.all(peers.map(([,id])=>ev(id,rawScript)));save();

}finally{
 clearTimeout(timer);report.final=await Promise.all(peers.map(([,id])=>state(id).catch(e=>({error:String(e)}))));
 await Promise.allSettled(peers.map(([,id])=>ev(id,'window.__wcStitchTrace?.dispose();return true')));save();
}
