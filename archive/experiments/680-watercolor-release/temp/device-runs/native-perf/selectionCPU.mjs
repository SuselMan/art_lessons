// Read-only microbenchmark of selection order. This does not render, does
// not model full foreign-source eligibility, and does not establish GPU cost.
import {readFileSync,writeFileSync} from 'node:fs'
import {strokeDabs} from '../../../packages/shared/src/dabCodec.ts'
import {selectedForeignWaterSources} from '../../../apps/web/src/engine/src/watercolor/foreignWater.ts'
const files=process.argv.slice(2),results=[]
for(const file of files){
 const ops=JSON.parse(readFileSync(file,'utf8')).filter(o=>o.type==='stroke'&&o.tool==='watercolor')
 const sources=ops.map(o=>({gesture:o.strokeId||o.id,footprints:strokeDabs(o).map(d=>({x:d.x,y:d.y,radius:d.size*.5,aspect:Math.max(1,d.aspectRatio),angle:d.angle}))})).filter(s=>s.footprints.length)
 // Exact geometry helper; one contact per segment matches combined call
 // shape. Nominal radius uses multiplier1, labelled below, not full replay.
 const largest=[...sources].sort((a,b)=>b.footprints.length-a.footprints.length)[0];if(!largest)continue
 const contacts=largest.footprints.filter((_,i)=>i%Math.max(1,Math.floor(largest.footprints.length/64))===0).slice(0,64)
 const cases=[]
 for(const fraction of [0,.5,1]){
  const imported=new Set(sources.slice(0,Math.floor(sources.length*fraction)).map(s=>s.gesture))
  const baseline=p=>selectedForeignWaterSources(sources,[p]).filter(s=>!imported.has(s.gesture))
  const candidate=p=>selectedForeignWaterSources(sources.filter(s=>!imported.has(s.gesture)),[p])
  for(const p of contacts)if(JSON.stringify(baseline(p).map(s=>s.gesture))!==JSON.stringify(candidate(p).map(s=>s.gesture)))throw Error('Selection/order mismatch')
  const bench=fn=>{const t=performance.now();let total=0;for(let repeat=0;repeat<3;repeat++)for(const p of contacts)total+=fn(p).length;return{ms:performance.now()-t,total}}
  const b=bench(baseline),c=bench(candidate);cases.push({importedFraction:fraction,imported:imported.size,baseline:b,candidate:c,equal:true})
 }
 results.push({file:file.split('/').pop(),sources:sources.length,footprints:sources.reduce((n,s)=>n+s.footprints.length,0),largestFootprints:largest.footprints.length,contacts:contacts.length,cases})
}
const report={kind:'CPU geometry microbenchmark only',presetMultiplier:1,eligibility:'All actual watercolor strokes included; not runtime time/wash/layer filtering.',results}
writeFileSync(new URL('./selectionCPU.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
