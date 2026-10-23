import {ev,joinAndInstall} from '../../../apps/web/scripts/devices/bridge.mjs';
import {writeFileSync,readFileSync} from 'node:fs';
const peers=[['laptop','4ng0kf'],['surface','5sdfa7']];const report={room:'2zb7P90s',checks:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
while(!readFileSync(new URL('./wc-live-complex.log',import.meta.url),'utf8').includes('report '))await sleep(1000);
async function check(label){const data={};for(const[name,id]of peers)data[name]=await ev(id,`return JSON.stringify({ops:__engine.getOperations(),samples:[...__engine._layers.keys()].filter(id=>id!=='background').map(id=>({id,...JSON.parse(__mt.sample(id,48))})),state:{rebuild:[...__engine._rebuildJobs.keys()],queue:__engine._opQueue.length,settle:!!__engine._settle,unsettled:[...__engine._unsettledLayers],resettles:__engine._resettleCount,wash:__engine._wash&&{id:__engine._wash.id,age:performance.now()-__engine._wash.endedAt},contextLost:__engine.gpuInfo().contextLost}})`);
const diffs={};for(const ref of data.laptop.samples){const x=data.surface.samples.find(s=>s.id===ref.id);if(x?.cells&&ref.cells){let max=0,n=0;for(let i=0;i<ref.cells.length;i++){const d=Math.abs(ref.cells[i]-x.cells[i]);max=Math.max(max,d);if(d>24)n++;}diffs[ref.id]={max,channelsOver24:n};}}
report.checks.push({label,at:Date.now(),data,diffs});writeFileSync(new URL('./wc-complex-settle.json',import.meta.url),JSON.stringify(report,null,2));console.log(label,JSON.stringify(diffs),JSON.stringify(Object.fromEntries(Object.entries(data).map(([n,d])=>[n,d.state]))));}
await check('after script');for(let i=0;i<6;i++){await sleep(20000);await check('after '+(i+1)*20+'s');}
await ev('4ng0kf',"__devNavigate(location.pathname+'?fresh='+Date.now());return 'reload'");await sleep(10000);await joinAndInstall('4ng0kf',report.room);await check('after laptop reload');console.log('DONE');
