import { brushDragField } from '../../../../apps/web/src/engine/src/watercolor/brushDrag'
import { brushDragFieldHoisted } from './BrushDragHoisted'
import { performance } from 'node:perf_hooks'
const travel = Array.from({length: 12},(_,i)=>({x:200+i*4,y:200+i*3,radius:200,aspect:1.3,angle:.73,dx:i%2?-8:8,dy:3,water:.8}))
const rect={x:0,y:0,w:512,h:512}
const fns={baseline:brushDragField,hoisted:brushDragFieldHoisted}
for(const fn of Object.values(fns))for(let i=0;i<4;i++)fn(travel,rect)
const result:Record<string,number[]>={baseline:[],hoisted:[]}
let witness=0
for(let round=0;round<8;round++)for(const name of (round%2?['hoisted','baseline']:['baseline','hoisted'])){
 const start=performance.now();for(let i=0;i<10;i++){const p=fns[name as keyof typeof fns](travel,rect)!;witness+=p.pixels[17]}
 result[name].push((performance.now()-start)/10)
}
console.log(JSON.stringify({scope:'VPS CPU-only warm alternating synthetic12dabs512field; no device/UP extrapolation',samplesMs:result,witness},null,2))
