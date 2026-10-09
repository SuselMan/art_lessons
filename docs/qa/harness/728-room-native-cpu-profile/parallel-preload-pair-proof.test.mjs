import {sourceABrowserPaths} from './source-A-browser-passport.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {assertParallelPreloadPair} from './parallel-preload-pair-proof.mjs'
const paths=['apps/web/src/engine/index.ts','apps/web/src/engine/src/webgpuCanonical/roomNativeRuntime.ts','apps/web/src/engine/src/webgpuCanonical/roomWatercolorExecutor.ts','apps/web/src/engine/src/webgpuCanonical/backend.ts']
function fixture(){
 const hash='a'.repeat(64),tape=Array.from({length:4},(_,i)=>({id:String(i),type:'stroke',layerId:'original',dabsPacked:'exact'+i})),observed={shaderSHAs:[hash,hash]},pressure={shaderSHA:hash},rows=[{kind:'waterFront',completed:true,hits:1},{kind:'diffuse',completed:true,hits:1}]
 const ref={complete:true,errors:[],ownedContextDisposed:true,final:{gl:0,lost:false},source:'same',browserPaper:{sha256:hash},browserSource:paths.map(path=>({path,sha256:hash})),export:{sha:hash,width:1754,height:2480,alpha:123},packedTape:tape,actualObserved:{ready:observed},actualAsyncPressure:{compile:pressure}}
 const off={...structuredClone(ref),replay:{mapped:tape.map(o=>({...o,layerId:'fresh'}))},endpointExact:true,readbackOutsideReplayTiming:true,startup:{wallMs:100},replayWallMs:50,scheduler:{actualPreload:false}}
 const on={...structuredClone(off),scheduler:{actualPreload:true},actualPreparation:structuredClone({observed,pressure,consumed:{observed:rows,pressure:{hits:1}}})}
 return[ref,off,on]
}
test('same source/paper/packed material endpoint pair separates startup and replay scopes',()=>{
 const value=assertParallelPreloadPair(...fixture());assert.equal(value.rows.length,2);assert.equal(value.rows[0].startupWallMs,100);assert.equal(value.rows[0].replayWallMs,50)
})
test('changed inputs/source/material, missing cleanup and compile identities fail closed',()=>{
 for(const mutate of [r=>{r[2].source='other'},r=>{r[2].browserSource[0].path='wrong'},r=>{r[1].replay.mapped[0].dabsPacked='changed'},r=>{r[2].export.sha='other'},r=>{r[1].ownedContextDisposed=false},r=>{r[1].memoryError='ssh unavailable'},r=>{r[2].actualPreparation.pressure.shaderSHA='other'},r=>{r[2].actualPreparation.consumed.observed[0].hits=0}]){const rows=fixture();mutate(rows);assert.throws(()=>assertParallelPreloadPair(...rows))}
})

import {assertSourcePrecompilePair,assertSourcePrecompileActualArms} from './parallel-preload-pair-proof.mjs'
function sourceFixture(){
 const [ref,off,on]=fixture(),hash='a'.repeat(64)
 const required=['stamp:false:false:coverage','ribbon:coverage','canonicalCompositeRecipe','canonicalRawCanvasRecipe','pairedBrush','singleBrush']
 const passport=Array.from({length:15},(_,i)=>({key:required[i]??'unused'+i,kind:i<12?'render':'compute',shaderSHA:hash,descriptorSHA:hash}))
 const ready={dispatches:0,fieldBytes:0,resourceBefore:[{bytes:16}],resourceAfter:[{bytes:16}],proofs:passport.map(p=>({...p,completed:true}))}
 for(const r of [ref,off,on]){r.source='b'.repeat(40);r.browserFactorySource=sourceABrowserPaths.map(path=>({path,sha256:hash}));r.export.purple=123;r.scenario='water-pigment400-long';r.packedTape=r.packedTape.slice(0,2);r.sourcePipelinePassport=structuredClone(passport);r.sourceRequiredKeys=[...required]}
 for(const r of [ref,off,on]){r.packedTape[0].tool='watercolor';r.packedTape[1].tool='watercolor';r.packedTape[0].preset='normal:100:0:PB29:round';r.packedTape[1].preset='normal:100:100:PB29:round';for(const o of r.packedTape)o.color=[.2,0,.6]}
 ref.sourcePreparation={ready};off.replay.mapped=off.replay.mapped.slice(0,2);on.replay.mapped=on.replay.mapped.slice(0,2);for(const r of [off,on])r.replay.mapped=ref.packedTape.map(o=>({...structuredClone(o),layerId:'fresh'}))
 for(const r of [off,on]){r.scheduler={actualPreload:true,sourcePrecompile:r===on,fullWarm:false,rawWarm:false,inflightLimit:0,asyncPressure:false};r.actualPreparation=structuredClone(on.actualPreparation)}
 on.sourcePreparation={ready:structuredClone(ready),consumed:required.map(key=>({key,completed:true,hits:1}))}
 return[ref,off,on]
}
test('source A exact long two-op pair leaves existing3 ON',()=>assert.equal(assertSourcePrecompilePair(...sourceFixture()).rows.length,2))
test('source A rejects wrong mode/warm/ops/seed/HIT/passports',()=>{
 for(const mutate of [r=>r[1].scheduler.actualPreload=false,r=>r[2].scheduler.fullWarm=true,r=>r[2].scheduler.rawWarm=true,r=>r[1].replay.mapped[0].dabsPacked='other',r=>r[2].sourcePreparation.ready.fieldBytes=4,r=>r[2].sourcePreparation.ready.resourceAfter=[],r=>r[2].sourcePreparation.consumed[1].hits=0,r=>r[1].actualPreparation.consumed.pressure.hits=0,r=>r[2].sourcePipelinePassport[0].descriptorSHA='f'.repeat(64),r=>r[0].scenario='four400',r=>r[0].packedTape[0].preset='normal:100:100:PB29:round',r=>r[1].export.sha='wrong',r=>r[2].sourceRequiredKeys.pop(),r=>r[1].export.purple=0,r=>r[2].browserFactorySource[0].sha256='e'.repeat(64)]){const rows=sourceFixture();mutate(rows);assert.throws(()=>assertSourcePrecompilePair(...rows))}
})

test('independent two actual arms permits input-only reference, keeps historical gate strict',()=>{const rows=sourceFixture();delete rows[0].final;assert.throws(()=>assertSourcePrecompilePair(...rows));const proof=assertSourcePrecompileActualArms(...rows);assert.equal(proof.healthyActualArms,2);assert.match(proof.referenceScope,/health not proved/)})
test('independent actual arm gate rejects missing/wrong mapped/final/loss/input/hash',()=>{for(const mutate of [r=>delete r[1].final,r=>r[2].final.lost=true,r=>r[1].replay.mapped[0].dabsPacked='changed',r=>r[0].packedTape[0].dabsPacked='changed',r=>r[2].browserFactorySource.pop(),r=>r[1].browserSource[0].sha256='f'.repeat(64),r=>r[1].source='other',r=>r[2].final.gl=1282,r=>r[2].sourcePreparation.consumed[0].hits=0]){const rows=sourceFixture();delete rows[0].final;mutate(rows);assert.throws(()=>assertSourcePrecompileActualArms(...rows))}})
