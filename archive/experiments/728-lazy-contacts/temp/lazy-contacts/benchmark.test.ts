import { it } from 'vitest'
import { brushDragField, brushDragContactGroups } from '../../apps/web/src/engine/src/watercolor/brushDrag'
import { brushDragFieldWork } from '../../apps/web/src/engine/src/watercolor/brushDragFieldWork'
it('diagnostic bounded producer timing, not hardware FPS', () => {
 const reports=[]
 for(const radius of [40,200,800]) {
 const travel=Array.from({length:40},(_,i)=>({x:800+i*4,y:800+i%2*40,radius,aspect:2.5,angle:i*.13,dx:i%2?-24:24,dy:6,water:1}))
 const rect={x:0,y:0,w:3072,h:3072};const start=performance.now();const groups=brushDragContactGroups(travel,rect);const descriptorsMs=performance.now()-start
 const first=performance.now();brushDragField(groups[0].travel,groups[0].rect);const firstEagerMs=performance.now()-first
 const durations=[];let exact=true
 for(const g of groups.slice(1)) {const work=brushDragFieldWork(g.travel,g.rect);let r;do{const t=performance.now();r=work.next();durations.push(performance.now()-t)}while(!r.done);const old=brushDragField(g.travel,g.rect)!;if(Buffer.compare(old.pixels,r.value!.pixels))exact=false}
 reports.push({radius,groups:groups.length,descriptorsMs,firstEagerMs,microsteps:durations.length,maxMicrostepMs:Math.max(...durations),exact})
 }
 console.log(JSON.stringify({scope:'HOME Node CPU warm-up sensitive single sample; allocations and first field synchronous; not device/frame budget proof',reports}))
},30000)
