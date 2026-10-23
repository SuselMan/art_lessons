import {ev} from '../../../apps/web/scripts/devices/bridge.mjs';
import fs from 'node:fs';
const out={at:new Date().toISOString(),devices:{}};
for(const [name,id] of [['laptop','4ng0kf'],['surface','5sdfa7'],['ipad','quyopf']])try{out.devices[name]=await ev(id,`return {methods:window.__qaGpuMethodProbe?.entries??[],readbacks:window.__qaReadbackProbe?.entries??[],waits:window.__qaGpuWaitProbe?.entries??[],captures:window.__qaExactCaptureEvents??[],jobs:Array.from(__engine._rebuildJobs?.values()??[]).map(j=>({applied:j.applied.length,start:j.start}))};`,10000);}catch(e){out.devices[name]={error:String(e)}}
fs.writeFileSync(`temp/device-runs/qa-2026-10-02/probes-${process.argv[2]??'latest'}.json`,JSON.stringify(out,null,2));
for(const [name,v] of Object.entries(out.devices))console.log(name,JSON.stringify(v));
