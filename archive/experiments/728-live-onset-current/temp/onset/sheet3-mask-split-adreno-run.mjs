import{createRequire}from'node:module';import fs from'node:fs';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';import{gzipSync}from'node:zlib';
const WebSocket=createRequire('/home/suselman/projects/pencil-agents/680-device-qa-guards/package.json')('ws');
const base='http://127.0.0.1:9338',nonce='sheet3mask580_'+Date.now(),url='http://192.168.1.70:5325/cost-domain.html?qa='+nonce,OUT=process.env.WC_QA_OUT;
if(!OUT)throw Error('Explicit output required');fs.mkdirSync(OUT,{recursive:true});
const fn=fs.readFileSync(new URL('./sheet3-mask-split-function.js',import.meta.url),'utf8');new Function('return '+fn);
const manifest=JSON.parse(fs.readFileSync(new URL('./costmask-current-manifest.json',import.meta.url),'utf8'));
const original=fs.readFileSync(new URL('./sheet3-curated42.json',import.meta.url));const inputSHA=createHash('sha256').update(original).digest('hex');if(inputSHA!=='ecbb146ddd9ecf3b6c3c46cc289245d92cbf246cf8225490eea70a9dee3ce1d9')throw Error('Immutable original journal mismatch');const originalOps=JSON.parse(original),ops=originalOps.filter(o=>o.type!=='image_import'),targetOp=ops.find(o=>o.seq===61);if(originalOps.length!==42||ops.length!==41||!targetOp)throw Error('Fixture count/target');
const harnessSHA={controller:createHash('sha256').update(fs.readFileSync(new URL('./sheet3-mask-split-adreno-run.mjs',import.meta.url))).digest('hex'),function:createHash('sha256').update(fn).digest('hex')};
const report={url,nonce,manifest,harnessSHA,inputSHA,errors:[],network:[],stages:[],arms:[],scope:'immutable42 original curated journal, target61only diagnostic OFF/ON, phase/baked/rebase fixed; no nativeperf/Room claim'};let target,ws,seq=0,progress,memoryMonitor;const pending=new Map();
const save=()=>fs.writeFileSync(OUT+'/report.json',JSON.stringify(report,null,2));
const send=(method,params={},timeout=15000)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},timeout);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))});
const evaluate=async(expression,timeout)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},timeout);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value};
const wall=setTimeout(()=>{report.timeout=true;save();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Outer watchdog600'));}pending.clear();if(target)void fetch(base+'/json/close/'+target.id,{signal:AbortSignal.timeout(10000)})},600000);
try{
 report.serial=execFileSync('/home/suselman/.local/bin/home-devices',['adb','shell','getprop','ro.serialno'],{timeout:10000}).toString().trim();if(report.serial!=='R52RB0JXVSY')throw Error('Serial mismatch');
 const memory=execFileSync('/home/suselman/.local/bin/home-devices',['adb','shell','cat','/proc/meminfo'],{timeout:10000}).toString();report.deviceMemAvailableKiB=Number(memory.match(/^MemAvailable:\s+(\d+)/m)?.[1]);
 if(report.deviceMemAvailableKiB<1700*1024)throw Error('Device RAM preflight1700');
 report.version=await(await fetch(base+'/json/version')).json();delete report.version.webSocketDebuggerUrl;
 const before=await(await fetch(base+'/json/list')).json(),known=new Set(before.map(t=>t.id));report.beforeIDs=[...known];
 execFileSync('/home/suselman/.local/bin/home-devices',['adb','shell','am','start','-a','android.intent.action.VIEW','-d',url,'-p','com.android.chrome','--ez','create_new_tab','true'],{timeout:15000});
 for(let i=0;i<40&&!target;i++){const list=await(await fetch(base+'/json/list')).json();target=list.find(t=>!known.has(t.id)&&t.url===url);if(!target)await new Promise(r=>setTimeout(r,250))}if(!target)throw Error('No exact new own target');report.target=target.id;
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
 ws.on('message',raw=>{const x=JSON.parse(raw);if(x.id){const p=pending.get(x.id);if(p){clearTimeout(p.timer);pending.delete(x.id);x.error?p.reject(Error(x.error.message)):p.resolve(x.result)}}else if(x.method==='Runtime.exceptionThrown')report.errors.push(x.params.exceptionDetails.text);else if(x.method==='Network.loadingFailed')report.network.push({type:x.params.type,error:x.params.errorText})});
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Page.bringToFront');
 report.boot=await evaluate('({url:location.href,ready:document.readyState,visibility:document.visibilityState})');if(report.boot.url!==url||report.boot.visibility!=='visible')throw Error('Own foreground guard');
 memoryMonitor=setInterval(()=>{try{const info=execFileSync('/home/suselman/.local/bin/home-devices',['adb','shell','cat','/proc/meminfo'],{timeout:5000}).toString(),kb=Number(info.match(/^MemAvailable:\s+(\d+)/m)?.[1]);report.latestDeviceMemAvailableKiB=kb;if(kb<500*1024){report.memoryAbort=true;save();if(target)void fetch(base+'/json/close/'+target.id)}}catch(e){report.memoryPollError=String(e)}},15000);
 progress=setInterval(()=>{void evaluate('window.__maskSolverPhase??null',5000).then(p=>{report.stages.push({at:new Date().toISOString(),...p});save()}).catch(()=>{})},10000);
 for(const enabled of [false,true]){
  report.arm=enabled?'ON':'OFF';save();
  const input={source:manifest.base,costPaths:enabled,ops,targetId:targetOp.id,roi:{minX:910,minY:455,maxX:1264,maxY:721},targetBox:{minX:1040,minY:552,maxX:1130,maxY:636},finalDry:{id:'s3-immutable-terminal-dry',type:'paper_dry',timestamp:1791345600000,userId:'gallery-render'},strokeLayers:[...new Set(ops.filter(o=>o.type==='stroke').map(o=>o.layerId))]};
  const setup=await evaluate('('+fn+')('+JSON.stringify(input)+')',30000);report.setup=setup;save();if(!setup.ready)throw Error('Split setup not ready');
  let row;const saved=new Set();
  const savePartial=async()=>{
   row=await evaluate('window.__maskSolverSession.out',15000);
   for(const plane of row.planes??[])for(const rec of [...plane.records,...['bandRecord','lift'].map(k=>plane[k]).filter(Boolean)])if(rec.rawKey&&!saved.has(rec.rawKey)){
    const parts=[];for(let offset=0;offset<rec.byteLength;offset+=65536){const part=await evaluate('window.__maskSolverSession.chunk('+JSON.stringify(rec.rawKey)+','+offset+',65536)',10000);parts.push(Buffer.from(part,'base64'));}
    const raw=Buffer.concat(parts),file=`${report.arm}-${plane.label}-${rec.name}.rgba.gz`;if(raw.length!==rec.byteLength)throw Error('Stream size mismatch');fs.writeFileSync(OUT+'/'+file,gzipSync(raw));rec.sha256=createHash('sha256').update(raw).digest('hex');if(rec.sha256!==rec.browserSHA)throw Error('Browser/stream SHA mismatch');rec.file=file;saved.add(rec.rawKey);
    await evaluate('Object.assign([...window.__maskSolverSession.out.planes.flatMap(p=>[...p.records,p.bandRecord,p.lift].filter(Boolean))].find(r=>r.rawKey==='+JSON.stringify(rec.rawKey)+'),'+JSON.stringify({sha256:rec.sha256,file})+');window.__maskSolverSession.raw.delete('+JSON.stringify(rec.rawKey)+');true',10000);
   }
   report.partial=row;save();
  };
  for(const [phase,budget] of [['prefix',210000],['target',90000],['suffix',90000],['export',45000]]){
   report.stage=phase;save();const started=Date.now();report.stageResult=await evaluate('window.__maskSolverSession.run('+JSON.stringify(phase)+')',budget);report.stageWallMs=Date.now()-started;(report.executionStages??=[]).push({arm:report.arm,phase,wallMs:report.stageWallMs,at:new Date().toISOString(),result:report.stageResult});save();if(report.stageResult.gl||report.stageResult.lost)throw Error('Stage GL/context guard '+phase);await savePartial();
  }
  if(row.final){fs.writeFileSync(OUT+'/'+report.arm+'-final.png',Buffer.from(row.final,'base64'));delete row.final;await evaluate('delete window.__maskSolverSession.out.final;true');}
  await evaluate('window.__maskSolverSession.dispose();true');row.engineClosed=true;delete report.partial;
  report.arms.push(row);save();
  if(row.error||row.gl||row.lost||!row.engineClosed||row.guards?.matchedJobs!==1||row.guards.carryCalls!==14||row.guards.phaseCalls!==14||!row.guards.owner14||!row.guards.singlePaint)throw Error('Actual stage/material/ownership guard');
  if(enabled&&(row.guards.maskCalls!==56||row.guards.maskedCarry!==14||row.maskReachability?.length!==2||row.maskReachability.some(m=>m.differences||!m.nonzero)))throw Error('Actual mask56/carry14/reachability guard');
  if(!enabled&&(row.guards.maskCalls||row.guards.maskedCarry))throw Error('Baseline mask unexpectedly enabled');
  const pre=row.planes.find(p=>p.label==='pre-carry');if(!pre||pre.records.some(r=>r.missing||r.outside||r.name!=='cost'&&!r.alphaNonzero))throw Error('Meaningful preinputs guard');
 }
 const pre=report.arms.map(a=>a.planes.find(p=>p.label==='pre-carry').records.map(r=>[r.name,r.sha256,r.read]));report.preInputsExact=JSON.stringify(pre[0])===JSON.stringify(pre[1]);if(!report.preInputsExact)throw Error('Immutable precarry inputs differ');report.completed=true;
}catch(error){report.error=String(error);process.exitCode=1;if(ws?.readyState===1){try{report.partial=await evaluate('window.__maskSolverPartial?({...window.__maskSolverPartial,final:undefined}):null',5000)}catch{}try{await evaluate('window.__maskSolverSession?.dispose();true',5000)}catch{}}}finally{clearTimeout(wall);clearInterval(progress);clearInterval(memoryMonitor);ws?.close();if(target){const close=await fetch(base+'/json/close/'+target.id,{signal:AbortSignal.timeout(10000)});report.ownTargetClosed=close.ok;report.closeStatus=close.status}save()}
console.log(JSON.stringify({completed:report.completed,error:report.error,target:report.target,closed:report.ownTargetClosed}));
