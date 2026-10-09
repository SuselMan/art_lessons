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
