import { ev, joinAndInstall, pageLib } from '../../../apps/web/scripts/devices/bridge.mjs'
import { writeFileSync } from 'node:fs'
const page=process.argv[2], root=process.argv[3]; if(!page||!root) throw Error('Usage: smoke.mjs <bridge page> <existing output directory with trailing slash>; fresh QA room only')
const result={started:new Date().toISOString(),cases:[]}
const save=()=>writeFileSync(root+'samsung-rapid-smoke.json',JSON.stringify(result,null,2))
await joinAndInstall(page)
await ev(page,'delete window.__mt;return true;');
await ev(page,pageLib.replace('t - now < 1500','t - now < 0'))
await ev(page,`window.__qaSmokeErrors=[];window.addEventListener('error',e=>__qaSmokeErrors.push(e.message));window.addEventListener('unhandledrejection',e=>__qaSmokeErrors.push(String(e.reason)));__roomStore.getState().setTool('watercolor');return 'ready';`)
const status=()=>ev(page,`const e=__engine;return {model:e._watercolorModel,pending:e._wcCanonical.pending,settle:!!e._settle,ops:e.getOperations().filter(o=>o.type==='stroke').length,gl:e.gl.getError(),lost:e.gl.isContextLost(),error:String(e._wcAsyncError),errors:window.__qaSmokeErrors,owners:[...e._wcMaterialOwners.layers.values()].map(o=>o.extent),perf:e.getWatercolorPerf()};`)
result.before=await status();save();if(result.before.model!=='front8-v1')throw Error('Wrong material model')
for(const zoom of [.25,.5,1,2]){
 await ev(page,`__roomStore.getState().setViewport({...__roomStore.getState().viewport,zoom:${zoom},angle:0});return 'zoom';`)
 await new Promise(r=>setTimeout(r,250))
 await ev(page,`return __mt.setup({tool:'watercolor',size:90,preset:'normal:100:69:PB29:round',color:[.2,.3,.7]});`)
 const a=await ev(page,`return await __mt.stroke({pts:[[.45,.45],[.55,.55]],ms:300});`,30000)
 const b=await ev(page,`return await __mt.stroke({pts:[[.45,.55],[.55,.45]],ms:300});`,30000)
 const state=await status();result.cases.push({zoom,first:a,second:b,state});save();console.log(zoom,a,b,state.errors,state.error)
 if(state.lost||state.errors.length||state.error!=='null'||a.drawnOperations<1||b.drawnOperations<1)throw Error('Samsung smoke failed')
}
result.finished=new Date().toISOString();save();console.log('SMOKE COMPLETE')
