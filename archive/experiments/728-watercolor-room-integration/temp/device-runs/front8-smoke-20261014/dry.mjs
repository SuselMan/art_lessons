import {ev} from '../../../apps/web/scripts/devices/bridge.mjs'
import {writeFileSync} from 'node:fs'
const root='temp/device-runs/front8-smoke-20261014/'
const r=await ev('Android',`const e=__engine,t0=performance.now(),frames=[];let last=t0;const capture=t=>{frames.push(t-last);last=t;if(!done)requestAnimationFrame(capture)};let done=false;requestAnimationFrame(capture);const button=[...document.querySelectorAll('button')].find(b=>/Dry everything|Высушить всё/i.test(b.getAttribute('aria-label')??''));if(!button)throw Error('Dry button missing');button.click();while(e._wcCanonical.pending||e._settle||e._rebuildJobs.size||e._opQueue.length){if(performance.now()-t0>90000)throw Error('Dry exceeded 90s');await new Promise(r=>setTimeout(r,100));}done=true;return {dryMs:performance.now()-t0,frames:frames.length,maxFrame:Math.max(0,...frames),over100:frames.filter(v=>v>100).length,errors:__qaSmokeErrors,gl:e.gl.getError(),stats:e._wcDryWorkScheduler.stats,ops:e.getOperations().filter(o=>o.type==='stroke').length};`,100000)
writeFileSync(root+'samsung-dry.json',JSON.stringify(r,null,2));console.log(r)
await ev('Android',`__roomStore.getState().setViewport({...__roomStore.getState().viewport,zoom:.5});return true;`)
await new Promise(r=>setTimeout(r,500))
const png=await ev('Android',`__engine._display();return __engine.canvas.toDataURL('image/png');`)
writeFileSync(root+'samsung-room.png',Buffer.from(png.split(',')[1],'base64'))
