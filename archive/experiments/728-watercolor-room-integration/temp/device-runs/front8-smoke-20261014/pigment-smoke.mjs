import { ev,joinAndInstall,pageLib } from '../../../apps/web/scripts/devices/bridge.mjs'
import {writeFileSync} from 'node:fs'
const page='bn18ki'
await ev(page,`__roomStore.getState().setTool('watercolor');__roomStore.getState().setViewport({...__roomStore.getState().viewport,x:877,y:1240,zoom:.3,angle:0});return true;`)
await ev(page,`delete window.__mt;${pageLib}`)
await ev(page,`__mt.setup({size:120,color:[.2,.3,.7],preset:'normal:100:69:PB29:round'});const e=__engine,c=e._compositor;window.__pigmentProbe={started:performance.now(),draws:[]};const original=c.drawTileComposite;c.drawTileComposite=function(...args){const o=[...e._wcMaterialOwners.layers.values()].find(o=>o.material.buffer.texture===args[1]);if(o&&__pigmentProbe.draws.length<8)__pigmentProbe.draws.push({ms:performance.now()-__pigmentProbe.started,active:!!e._strokeLayerId,pending:e._wcCanonical.pending,extent:o.extent,view:args[0].view});return original.apply(this,args)};window.__restorePigmentProbe=()=>c.drawTileComposite=original;return true;`)
const stroke=await ev(page,`return await __mt.stroke({pts:[[.46,.45],[.54,.55]],ms:600});`,30000)
const result=await ev(page,`__restorePigmentProbe();return {probe:__pigmentProbe,gl:__engine.gl.getError(),lost:__engine.gl.isContextLost(),model:__engine._watercolorModel};`)
writeFileSync('temp/device-runs/front8-smoke-20261014/pigment-smoke.json',JSON.stringify({stroke,...result},null,2));console.log(JSON.stringify({stroke,...result}))
