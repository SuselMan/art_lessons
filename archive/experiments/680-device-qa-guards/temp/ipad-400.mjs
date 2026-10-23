import {writeFileSync} from 'node:fs';
import {ev} from '/home/suselman/projects/pencil-agents/680-lifetime-hardware/apps/web/scripts/devices/bridge.mjs';
const page='v2oOk7JI';
const mode=process.argv[2]??'water';const batch=process.argv[3]==='on';
const setup=await ev(page,`const e=window.__engine;if(e._settleQueue._settle)throw Error('not idle');if(typeof e._settleQueue.contactBatchEnabled!=='boolean')throw Error('candidate missing');e._settleQueue.contactBatchEnabled=${batch};window.__mt.setup({preset:${JSON.stringify(mode==='water'?'normal:100:0:PB29:round':'normal:100:100:PB29:round')},size:400,color:[.2,.35,.7]});return {layer:e._activeId,page:e._pageSize(),locked:e._locked,ops:e._log.entries.length,timeOrigin:performance.timeOrigin};`);
const t=Date.now();
const result=await ev(page,`const e=window.__engine;const r=JSON.parse(await window.__mt.stroke({pts:[[.2,.45],[.8,.45],[.2,.65],[.8,.65]],ms:4000,perFrame:2}));return {stroke:r,perf:e.getWatercolorPerf(),lost:e.gl.isContextLost(),error:e.gl.getError(),timeOrigin:performance.timeOrigin,ops:e._log.entries.map(x=>({type:x.op?.type,pending:x.pending,serverSeq:x.serverSeq}))};`,60000);
const out={mode,batch,setup,elapsedMs:Date.now()-t,result};writeFileSync(new URL(`./ipad-400-${mode}-${batch?'on':'off'}.json`,import.meta.url),JSON.stringify(out,null,2));console.log(JSON.stringify(out));
