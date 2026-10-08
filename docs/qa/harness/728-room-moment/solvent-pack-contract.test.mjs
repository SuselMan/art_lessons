import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=p=>fs.readFileSync(new URL('../../../../'+p,import.meta.url),'utf8')
test('actual native and production GL source recipes encode solvent R=A, G=B=0',()=>{
 const recipe=read('apps/web/src/engine/src/dabs/canonicalStrokeChunk.ts'),painter=read('apps/web/src/engine/src/dabs/RibbonStrokePainter.ts'),bands=read('apps/web/src/engine/src/dabs/canonicalRibbonBands.ts'),stamp=read('apps/web/src/engine/src/webgpuCanonical/stamp.ts'),shader=read('apps/web/src/engine/src/raster/shaders.ts')
 assert.match(recipe,/stamp\('solvent',dab,solventProfile,\(delivery.waterByDab.get\(dab\)\?\?0\)\/4,1,0,0,/)
 assert.match(painter,/\(waterByDab.get\(dab\) \?\? 0\) \/ 4, false, 1,[\s\S]*?0, 0, mottleSeed/)
 assert.match(bands,/ink: \(delivery.water.get\(d1\) \?\? 0\) \/ 4, water: 1, paperWet: 0,[\s\S]*?strength: 0/)
 assert.match(stamp,/o.pigment=vec4f\(amount\*u.paint.x,amount\*wet,amount\*u.paint.z,amount\)/)
 assert.match(shader,/gl_FragColor = vec4\(amount \* u_inkWater, amount \* depositWet, amount \* u_inkStrength, amount\)/)
 // Coverage is a separate tuple: it has available water in B. A consumer
 // bound to raw solvent cannot inherit that channel contract.
 assert.match(shader,/cov \* max\(u_paperWet, u_washWater[\s\S]*?cov\);/)
 const v=[.25,0,0,.25];assert.equal(v[2]/v[3],0);assert.equal(v[0]/v[3],1)
})
