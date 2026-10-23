import {ev,joinAndInstall}from'../../../apps/web/scripts/devices/bridge.mjs';import{writeFileSync}from'node:fs';
const room=process.argv[2];const peers=[['laptop','4ng0kf'],['surface','5sdfa7']];const report={room,checks:[]};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tools=['pencil','charcoal','liner','marker','brushPen','digitalBrush','eraser','smudge','watercolor'];
for(const[n,id]of peers){console.log(n,await joinAndInstall(id,room));}
async function setup(tool){await Promise.all(peers.map(([,id])=>ev(id,`const s=__roomStore.getState();s.setTool('${tool}');if(typeof s.toolSettings['${tool}'].size==='number')s.setToolSetting('${tool}','size',40);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));__engine.setSize(40);return __roomStore.getState().drawingTool`)));}
async function strokes(pts){return Promise.all(peers.map(([,id],i)=>ev(id,`return __mt.stroke({pts:${JSON.stringify(pts)},ms:${700+i*70}})`,15000)));}
async function check(tool){const data={};for(const[n,id]of peers)data[n]=await ev(id,`return JSON.stringify({ops:__engine.getOperations(),gpu:__engine.gpuInfo(),sample:JSON.parse(__mt.sample('layer-1',48))})`);
const a=data.laptop.sample.cells,b=data.surface.sample.cells;let max=0,over24=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);if(d>24)over24++;}
const idsEqual=JSON.stringify(data.laptop.ops.map(o=>o.id))===JSON.stringify(data.surface.ops.map(o=>o.id));const q={tool,at:Date.now(),max,over24,idsEqual,data};report.checks.push(q);writeFileSync(new URL('./live-tools.json',import.meta.url),JSON.stringify(report,null,2));console.log(tool,JSON.stringify({max,over24,idsEqual,ops:data.laptop.ops.length}));}
await setup('pencil');await strokes([[.3,.3],[.7,.3]]);
for(const tool of tools){await setup(tool);await strokes(tool==='eraser'||tool==='smudge'?[[.5,.25],[.5,.35]]:[[.3,.5],[.7,.5]]);await sleep(2500);await check(tool);await Promise.all(peers.map(([,id])=>ev(id,"const o=__engine.undo();return o?.id")));await sleep(1200);await Promise.all(peers.map(([,id])=>ev(id,"const o=__engine.redo();return o?.id")));await sleep(4000);await check(tool+' redo');}
console.log('DONE');
