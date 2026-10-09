import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {hoistFrontFilm,frontFilmOracle,filmExpression} from './FrontFilmHoist.mjs'
test('actual current front variants preserve literal film expression and all other source bytes',()=>{
 const text=fs.readFileSync(process.env.FRONT_KERNELS??'apps/web/src/engine/src/webgpuCanonical/passes/kernels.ts','utf8')
 const fronts=[...text.matchAll(/export const CANONICAL_(?:CACHED_)?WATER_FRONT_WGSL = CANONICAL_PASS_HEADER \+ `([\s\S]*?)`;/g)].map(m=>m[1]);assert.equal(fronts.length,2)
 for(const base of fronts)for(const sampler of ['original','manual','hardware']){
  const code=sampler==='original'?base:base.replaceAll('fieldAt(input,uv)','sourceAt(input,uv,u.wet.z)').replaceAll('fieldAt(input,uvj)','sourceAt(input,uvj,u.wet.z)')
  const changed=hoistFrontFilm(code);assert.ok(changed.includes(`film=${filmExpression};filmReady=true;`))
  const restored=changed.replace('var film=0.0;var filmReady=false;\n ','').replace(`if(!filmReady){film=${filmExpression};filmReady=true;}`,`let film=${filmExpression};`);assert.equal(restored,code)
 }
 assert.throws(()=>hoistFrontFilm('invalid'))
})
test('fixed f32 finite random/boundary/zero eligible Q8 identity',()=>{
 let seed=719;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
 for(let i=0;i<4096;i++){
 const x={source:rand(),max:64,floor:.1,stride:[1,2,8][i%3],climb:rand()*8,hj:rand(),coverage:[0,.02,.15,1][i%4],foreignWet:rand(),foreign:rand(),dry:1+rand()*3,neighbors:Array.from({length:8},(_,k)=>({inside:i%17!==0&&rand()>.1,ci:i%13===0?1:rand(),hi:rand(),len:k<4?1:Math.fround(1.41421356)}))}
 const a=frontFilmOracle(x,false),b=frontFilmOracle(x,true);assert.equal(a.value,b.value);assert.equal(a.q8,b.q8);assert.equal(b.loads,a.loads?1:0)
 }
})
