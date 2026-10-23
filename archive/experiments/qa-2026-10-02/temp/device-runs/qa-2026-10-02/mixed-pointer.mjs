import {chromium} from 'playwright';import{ev}from'../../../apps/web/scripts/devices/bridge.mjs';import{writeFileSync}from'node:fs';
const b=await chromium.connectOverCDP('http://127.0.0.1:9333');try{const p=b.contexts()[0].pages().find(p=>p.url().includes('5288'));
await p.evaluate(`(() => {
 window.__mixedRaw=[];window.__mixedWorld=[];const D=__engine._dabs;for(const name of ['startStroke','continueStroke']){const o=D[name];D[name]=function(...args){__mixedWorld.push({name,args});return o.apply(this,args)}};for(const type of ['pointermove','pointerup','pointercancel'])document.querySelector('canvas').addEventListener(type,e=>__mixedRaw.push({type,id:e.pointerId,pointerType:e.pointerType,buttons:e.buttons,x:e.clientX,y:e.clientY,active:__engine._pointer._activePointerId,coalesced:e.getCoalescedEvents?.().map(p=>({x:p.clientX,y:p.clientY,id:p.pointerId,buttons:p.buttons}))}),true);
 __mt.setup({tool:'pencil',preset:'4B',size:20,layerId:'layer-1'});
})()`);
const task=ev('4ng0kf',`return __mt.stroke({pts:[[.35,.5],[.65,.5]],ms:2000})`,15000);
await p.waitForFunction(()=>__engine._pointer._activePointerId===7);await p.waitForTimeout(100);await p.mouse.move(451,201);await p.waitForTimeout(100);await p.mouse.move(901,201);await task;
const data=await p.evaluate(`({raw:__mixedRaw,world:__mixedWorld,ops:__engine.getOperations().filter(o=>o.type==='stroke'&&o.strokeId===__engine.getOperations().filter(o=>o.type==='stroke').at(-1).strokeId),op:__engine.getOperations().filter(o=>o.type==='stroke').at(-1)})`);writeFileSync(new URL('./mixed-pointer-'+(process.env.RUN??'before')+'.json',import.meta.url),JSON.stringify(data,null,2));console.log(JSON.stringify({raw:data.raw,opId:data.op.id,tool:data.op.tool}));
}finally{await b.close()}
