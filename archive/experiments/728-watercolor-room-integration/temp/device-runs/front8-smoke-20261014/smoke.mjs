import { ev, joinAndInstall, pageLib } from '../../../apps/web/scripts/devices/bridge.mjs'
import { writeFileSync } from 'node:fs'
const page='Android', root='temp/device-runs/front8-smoke-20261014/'
const result={started:new Date().toISOString(),cases:[]}
const save=()=>writeFileSync(root+'samsung-smoke.json',JSON.stringify(result,null,2))
await joinAndInstall(page)
await ev(page,pageLib.replace('t - now < 1500','t - now < 0'))
await ev(page,`window.__qaSmokeErrors=[];window.addEventListener('error',e=>__qaSmokeErrors.push(e.message));window.addEventListener('unhandledrejection',e=>__qaSmokeErrors.push(String(e.reason)));__roomStore.getState().setTool('watercolor');return 'ready';`)
const status=()=>ev(page,`const e=__engine;return {model:e._watercolorModel,patched:e._showMaterialPresentation.toString().includes('page.w'),pending:e._wcCanonical.pending,settle:!!e._settle,ops:e.getOperations().filter(o=>o.type==='stroke').length,gl:e.gl.getError(),lost:e.gl.isContextLost(),error:String(e._wcAsyncError),errors:window.__qaSmokeErrors,owners:[...e._wcMaterialOwners.layers.values()].map(o=>o.extent),perf:e.getWatercolorPerf()};`)
result.before=await status();save();if(!result.before.patched)throw Error('Wrong Samsung build')
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
