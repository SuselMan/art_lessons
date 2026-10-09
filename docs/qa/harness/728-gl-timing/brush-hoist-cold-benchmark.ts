import { brushDragField } from '../../../../apps/web/src/engine/src/watercolor/brushDrag'
import { brushDragFieldHoisted } from './BrushDragHoisted'
import { performance } from 'node:perf_hooks'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const mode=process.argv[2]
if(mode){
 const travel=Array.from({length:12},(_,i)=>({x:200+i*4,y:200+i*3,radius:200,aspect:1.3,angle:.73,dx:i%2?-8:8,dy:3,water:.8}))
 const fn=mode==='baseline'?brushDragField:brushDragFieldHoisted
 const start=performance.now(),field=fn(travel,{x:0,y:0,w:512,h:512})!
 console.log(JSON.stringify({ms:performance.now()-start,witness:field.pixels[17]}))
}else{
 const samples:Record<string,number[]>={baseline:[],hoisted:[]}
 for(let round=0;round<8;round++)for(const name of (round%2?['hoisted','baseline']:['baseline','hoisted'])){
  const child=spawnSync(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),name],{encoding:'utf8',timeout:15000,maxBuffer:16384})
  if(child.status!==0)throw Error('Cold CPU process failed')
  const result=JSON.parse(child.stdout);if(result.witness!==128)throw Error('Cold result witness invalid')
  samples[name].push(result.ms)
 }
 console.log(JSON.stringify({scope:'VPS CPU-only first call in fresh Node process, excludes process startup; no device extrapolation',samplesMs:samples},null,2))
}
