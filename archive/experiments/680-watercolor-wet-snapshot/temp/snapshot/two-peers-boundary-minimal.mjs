// Preparation only: run later on the release stack and two owned device pages.
// WC_RELEASE_ROOT=<checkout> DEVBRIDGE_PORT=<port> node two-peers.mjs <fresh-room> A=<bridge-id> B=<bridge-id>
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const root=process.env.WC_RELEASE_ROOT
if(!root)throw Error('WC_RELEASE_ROOT must identify the isolated release checkout')
const {ev,joinAndInstall}=await import(pathToFileURL(resolve(root,'apps/web/scripts/devices/bridge.mjs')))
const [room,...args]=process.argv.slice(2), peers=args.map(a=>a.split('='))
if(!room||peers.length!==2||peers.some(p=>p.length!==2))throw Error('fresh-room A=<bridge-id> B=<bridge-id> required')
const out=resolve(process.env.WC_QA_OUT??'temp/release/two-peers-'+Date.now());mkdirSync(out,{recursive:true})
const boundaryProbe=readFileSync(new URL('./chunk-boundary-minimal-exact.js',import.meta.url),'utf8');
const probe=readFileSync(new URL('./page-probe.js',import.meta.url),'utf8')
const report={room,source:process.env.WC_QA_HEAD??'UNSTAMPED',checks:[],draws:[]}
const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const wall=setTimeout(()=>{report.wallTimeout=true;save();void Promise.race([Promise.allSettled(peers.map(p=>ev(p[1],"window.__wcChunkBoundary?.dispose();window.__wcRelease?.dispose();return true"))),sleep(3000)]).finally(()=>process.exit(124))},110000)
const state=p=>ev(p[1],'return window.__wcRelease.state()')
async function install(p){await joinAndInstall(p[1],room);await ev(p[1],probe);await ev(p[1],'window.__wcChunkROI={x:1006,y:894,w:256,h:128};await window.__engine.paperReady();return true');await ev(p[1],boundaryProbe);return state(p)}
async function phase(label){await Promise.all(peers.map(p=>ev(p[1],`return window.__wcRelease.phase(${JSON.stringify(label)})`)))}
async function barrier(label){
 if(!report.boundaries)report.boundaries=[];
 const deadline=Date.now()+30000;let states
 while(Date.now()<deadline){states=await Promise.all(peers.map(state));const normalize=s=>s.entries.map(({id,type,state,serverSeq,pending})=>({id,type,state,serverSeq,pending}));if(states.every(s=>s.idle&&!s.lost&&!s.entries.some(e=>e.pending))&&JSON.stringify(normalize(states[0]))===JSON.stringify(normalize(states[1])))break;await sleep(250)}
 if(!states||!states.every(s=>s.idle&&!s.lost&&!s.entries.some(e=>e.pending)))throw Error(label+': pending/GL/idle barrier failed')
 for(const s of states){const known=s.entries.filter(e=>Number.isInteger(e.serverSeq)).map(e=>e.serverSeq);if(new Set(s.entries.map(e=>e.id)).size!==s.entries.length)throw Error(label+': duplicate entry IDs');if(new Set(known).size!==known.length||known.some((v,i)=>i&&v<=known[i-1]))throw Error(label+': confirmed sequence not strictly increasing');}
 if(JSON.stringify(states[0].entries.map(e=>[e.id,e.state,e.serverSeq]))!==JSON.stringify(states[1].entries.map(e=>[e.id,e.state,e.serverSeq])))throw Error(label+': journals differ')
 const captures=[];
 for(const [name,id]of peers){
  const result=await ev(id,`window.__wcChunkBoundary.captureFinal();const E=window.__engine;
    const result=await window.__wcChunkBoundary.report();const roi=window.__wcChunkROI;
    const layer=E._layers.get('layer-1'),gl=E.gl,previous=gl.getParameter(gl.FRAMEBUFFER_BINDING),rgba=new Uint8ClampedArray(roi.w*roi.h*4);
    try{for(const tile of layer.allResident()){
      const x=Math.max(roi.x,tile.originX),y=Math.max(roi.y,tile.originY),right=Math.min(roi.x+roi.w,tile.originX+tile.buffer.width),bottom=Math.min(roi.y+roi.h,tile.originY+tile.buffer.height);if(right<=x||bottom<=y)continue;
      const w=right-x,h=bottom-y,bytes=new Uint8Array(w*h*4);gl.bindFramebuffer(gl.FRAMEBUFFER,tile.buffer.fbo);gl.readPixels(x-tile.originX,tile.buffer.height-(bottom-tile.originY),w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
      for(let row=0;row<h;row++)rgba.set(bytes.subarray((h-1-row)*w*4,(h-row)*w*4),((y-roi.y+row)*roi.w+x-roi.x)*4);
    }}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,previous);}
    const digest=await crypto.subtle.digest('SHA-256',rgba);const hash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
    const canvas=document.createElement('canvas');canvas.width=roi.w;canvas.height=roi.h;canvas.getContext('2d').putImageData(new ImageData(rgba,roi.w,roi.h),0,0);
    return {boundary:result,rawLayerROI:{roi,sha256:hash,nonzero:rgba.some(v=>v!==0),png:canvas.toDataURL('image/png').split(',')[1]},operations:JSON.parse(JSON.stringify(E.getOperations()))};`,30000);
  writeFileSync(out+'/'+label+'-'+name+'-roi.png',Buffer.from(result.rawLayerROI.png,'base64'));delete result.rawLayerROI.png;
  report.lastBoundary={label,name,...result};save();if(!result.boundary.roiChecks.coverageNonzero||!result.boundary.roiChecks.volumeNonzero||(label!=='clear-water'&&(!result.boundary.roiChecks.pigmentNonzero||!result.rawLayerROI.nonzero)))throw Error(label+': meaningful P/coverage/V ROI missing on '+name);
  captures.push({name,...result});
 }
 report.checks.push({label,captures,scope:'bounded raw canonical layer ROI only; no whole PNG claim'});save();return captures;

}
async function stroke(peer,preset,pts,size=80,ms=900){await ev(peer[1],`return window.__mt.setup(${JSON.stringify({preset,size,color:[.3,.12,.6]})})`);const result=await ev(peer[1],`return await window.__mt.stroke(${JSON.stringify({pts,ms})})`,90000);report.draws.push({peer:peer[0],preset,size,ms,result});save()}
try{
 const initial=await Promise.all(peers.map(install));report.initial=initial
 report.sameChrome=process.env.WC_QA_SAME_CHROME==='1';
 if(initial.some(s=>s.lost||(!report.sameChrome&&s.visibility!=='visible')))throw Error('Owned pages require live GL; device pages must be visible');
 if(report.sameChrome)report.performanceScope='Background throttling disabled; same Chrome logical parity only, not cross-GPU or user responsiveness';
 if(new Set(initial.map(s=>s.activeLayer)).size!==1)throw Error('Both peers must start on the same layer')
 if(new Set(initial.map(s=>s.userId)).size!==2)throw Error('Two independent identities required')
 if(JSON.stringify(initial[0].flags)!==JSON.stringify(initial[1].flags))throw Error('Candidate flag mismatch')
 if(process.env.WC_QA_F32_NATIVE==='1')await Promise.all(peers.map(p=>ev(p[1],'window.__wcQuantizeNative=true;return true')));
 const path=process.env.WC_QA_SHORT==='1'?[[.45,.4],[.55,.4]]:[[.3,.4],[.7,.4]]
 if(process.env.WC_QA_DRY_CONTROL!=='1'){await phase('clear-water');await stroke(peers[0],'normal:100:0:PB29:round',process.env.WC_DONOR_SHORT==='1'?[[.45,.4],[.55,.4]]:path);await barrier('clear-water')}
 await phase('foreign-dry-pigment');await stroke(peers[1],process.env.WC_QA_DRY_CONTROL==='1'?'normal:100:15:PB29:round':'normal:0:15:PB29:round',process.env.WC_PIGMENT_SHORT==='1'?[[.45,.4],[.55,.4]]:path);await barrier('foreign-dry-pigment')
 if(process.env.WC_QA_MINIMAL==='1'){
 report.preRejoinReports=await Promise.all(peers.map(p=>ev(p[1],'return window.__wcRelease.report()')));save();
 if(process.env.WC_QA_FINAL_GATE==='1'){
 await phase('dry-without-rebuild');await ev(peers[0][1],`window.__roomStore.getState().setTool('watercolor');await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const button=[...document.querySelectorAll('button')].find(b=>['Dry everything','Высушить всё'].includes(b.getAttribute('aria-label'))&&b.getBoundingClientRect().width>0&&!b.disabled);if(!button)throw Error('No visible Dry toolbar button');button.click();return true;`);await barrier('dry-no-rebuild');
 report.preReloadAfterDry=await Promise.all(peers.map(p=>ev(p[1],'return window.__wcRelease.report()')));save();
 }
 for(const p of(process.env.WC_QA_FINAL_GATE==='1'?peers:[peers[0]])){await ev(p[1],"window.__wcRelease.dispose();setTimeout(()=>__devNavigate(location.pathname+'?wcqa='+Date.now()),0);return 'reload'");await sleep(500);await install(p);}
 await barrier(process.env.WC_QA_FINAL_GATE==='1'?'both-fresh-replay':'A-rejoin');report.final=await Promise.all(peers.map(p=>ev(p[1],'return window.__wcRelease.report()')));save();
 }
 else {
 await phase('pending-peer-undo')
 const pendingUndo=ev(peers[1][1],`const E=window.__engine;const until=performance.now()+15000;while(performance.now()<until){if(E._settle||E._opQueue.length||E._peerLiveStrokes.size){const before={settle:!!E._settle,queue:E._opQueue.length,live:E._peerLiveStrokes.size};const op=E.undo();return {before,op};}await new Promise(r=>requestAnimationFrame(r));}return {notObserved:true};`,20000)
 await stroke(peers[0],'normal:100:70:PB29:round',[[.3,.42],[.7,.42],[.3,.44]],100,1400)
 const undo=await pendingUndo;report.pendingUndo={...undo,meaning:'B undoes its previous own pigment while A peer stroke is live/settling; not undo of A new gesture'};save();if(undo.notObserved||!undo.op)throw Error('Required undo overlap was not observed')
 await barrier('pending-undo')
 await phase('redo');report.redo=await ev(peers[1][1],'return window.__engine.redo()');if(!report.redo)throw Error('No redo target');await barrier('redo')
 await phase('shared-dry-native-toolbar');
 const dryBefore=new Set((await state(peers[0])).entries.filter(e=>e.type==='paper_dry').map(e=>e.id))
 report.nativeDryClick=await ev(peers[0][1],`window.__roomStore.getState().setTool('watercolor');await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const buttons=[...document.querySelectorAll('button')].filter(b=>['Dry everything','Высушить всё'].includes(b.getAttribute('aria-label'))&&b.getBoundingClientRect().width>0&&!b.disabled);if(buttons.length!==1)throw Error('Expected one visible native WatercolorDryButton');buttons[0].click();return {label:buttons[0].getAttribute('aria-label')};`)
 const dryCaptures=await barrier('shared-dry')
 const dry= dryCaptures[0].entries.filter(e=>e.type==='paper_dry'&&!dryBefore.has(e.id))
 if(dry.length!==1||!Number.isInteger(dry[0].serverSeq))throw Error('Toolbar paper_dry not confirmed by server')
 const peerDry=dryCaptures[1].entries.find(e=>e.id===dry[0].id)
 if(!peerDry||peerDry.serverSeq!==dry[0].serverSeq)throw Error('Peer did not confirm same paper_dry sequence')
 report.sharedDry={id:dry[0].id,serverSeq:dry[0].serverSeq,author:dry[0].author};save()
 // This is a full reconnect, not a fresh append behind the socket.
 const before=await state(peers[1]);report.beforeReload=before
 await ev(peers[1][1],"window.__wcRelease.dispose();setTimeout(()=>__devNavigate(location.pathname+'?wcqa='+Date.now()),0);return 'reload'")
 await sleep(500);report.afterReload=await install(peers[1]);if(report.afterReload.userId!==before.userId)throw Error('Reload changed participant identity')
 await barrier('rejoin')
 report.snapshotIndex=await ev(peers[0][1],`const r=await fetch('/api/rooms/'+${JSON.stringify(room)}+'/snapshots/index');return {status:r.status,body:r.status===200?await r.json():null}`)
 report.snapshotRestoreVerified=false // Separate real stored-snapshot gate is required; 204 is not success.
 report.final=await Promise.all(peers.map(p=>ev(p[1],'return window.__wcRelease.report()')));save()
 }
}finally{
 clearTimeout(wall)
 for(const p of peers)await ev(p[1],"window.__wcChunkBoundary?.dispose();window.__wcRelease?.dispose();return true").catch(()=>{})
 save()
}
console.log(JSON.stringify({out,checks:report.checks.length,snapshotRestoreVerified:report.snapshotRestoreVerified}))
