import { createHash } from 'node:crypto'
import { writeFileSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { CanonicalWatercolorSettlePlan } from '../../../../apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan'
import { traceFixture } from '../../../../apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan.fixture'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
const legacyFile = root + 'apps/web/src/engine/src/raster/LegacyPlanOracle.local.ts'
// Frozen history, never current source. Remove the generated module even on failure.
writeFileSync(legacyFile, execFileSync('git', ['show', '32213887:apps/web/src/engine/src/raster/WatercolorSettlePlan.ts'], { cwd: root }))
try {
const { WatercolorSettlePlan } = await import(legacyFile) as { WatercolorSettlePlan: typeof CanonicalWatercolorSettlePlan }
const cases = []
for (const half of [false,true]) for (const mixed of [false,true]) for (const film of [false,true]) for (const abort of [false,true]) {
 const f=traceFixture(half,mixed,film,true,true)
 const plan=new WatercolorSettlePlan(f.legacyContext as never)
 const result=plan.prepare(f.scratch as never,[{buffer:f.tile as never,originX:0,originY:0,contentRect:null}],{minX:f.width/2-12,minY:f.width/2-12,maxX:f.width/2+12,maxY:f.width/2+12},.2,half?400:8,1,1,1,1,0,(...args)=>f.record('preview',args))!
 f.record('domain',[result.compositeDomain])
 if(abort) result.ops[0]()
 else { for(const op of result.ops)op(); result.finish() }
 result.dispose(); result.dispose(); plan.destroyTextures()
 const counts:Record<string,number>={}
 for(const e of f.events)counts[e[0] as string]=(counts[e[0] as string]??0)+1
 cases.push({half,mixed,film,abort,count:f.events.length,counts,hash:createHash('sha256').update(JSON.stringify(f.events)).digest('hex')})
}
writeFileSync(root + 'apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan.trace.json',JSON.stringify({source:'32213887',scope:'CPU operation chronology only; no shader pixel proof',cases},null,2)+'\n')
console.log(`Generated ${cases.length} frozen chronology cases from 32213887`)
} finally { unlinkSync(legacyFile) }
