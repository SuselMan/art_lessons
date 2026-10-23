import {chromium} from 'playwright';
import{ev,joinAndInstall}from'../../../apps/web/scripts/devices/bridge.mjs';
import{writeFileSync}from'node:fs';
const peers=[['laptop','wrunf2'],['ipad','ghtkzg'],['surface','kk7m7f']];
const report={checks:[]};const save=()=>writeFileSync(new URL('./wc-convergence.json',import.meta.url),JSON.stringify(report,null,2));const sleep=ms=>new Promise(r=>setTimeout(r,ms));
report.room='lQUQYAGs';console.log('ROOM',report.room);
for(const[name,id]of peers){await joinAndInstall(id,report.room);await ev(id,`const s=__roomStore.getState();s.setTool('watercolor');s.setToolSetting('watercolor','size',60);s.setToolSetting('watercolor','water',1);s.setToolSetting('watercolor','pigment',0.7);return 'ready'`);}
await sleep(500);
async function check(label){const data={};for(const[name,id]of peers){data[name]=await ev(id,`return JSON.stringify({ops:__engine.getOperations(),sample:JSON.parse(__mt.sample('layer-1',48)),state:{rebuild:[...__engine._rebuildJobs.keys()],queue:__engine._opQueue.length,settle:!!__engine._settle,unsettled:[...__engine._unsettledLayers],resettles:__engine._resettleCount,wash:__engine._wash&&{id:__engine._wash.id,age:performance.now()-__engine._wash.endedAt},origin:performance.timeOrigin,contextLost:__engine.gpuInfo().contextLost}})`);}
 const diffs={};const ref=data.laptop.sample.cells;for(const name of ['ipad','surface']){const x=data[name].sample.cells;if(ref&&x){let max=0,n=0;for(let i=0;i<ref.length;i++){const d=Math.abs(ref[i]-x[i]);max=Math.max(max,d);if(d>24)n++;}diffs[name]={max,channelsOver24:n};}}
 report.checks.push({label,at:Date.now(),data,diffs});save();console.log(label,JSON.stringify(diffs),JSON.stringify(Object.fromEntries(Object.entries(data).map(([n,d])=>[n,d.state]))));}
await Promise.all(peers.map(([name,id],i)=>ev(id,`return __mt.stroke({pts:[[.35,.4],[.5,.5],[.65,.4]],ms:${1100+i*160}})`,60000)));
await check('pen-up');await sleep(10000);await check('after 10s');
for(let i=0;i<5;i++){await sleep(20000);await check('after '+(30+i*20)+'s');}
await ev('wrunf2',"__devNavigate(location.pathname+'?fresh='+Date.now());return 'reload'");await sleep(15000);await joinAndInstall('wrunf2',report.room);await check('after reload');console.log('DONE');
