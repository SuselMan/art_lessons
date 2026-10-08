import test from 'node:test'
import assert from 'node:assert/strict'
import {withGlOwnerCleanup} from './glOwnerCleanup'
import {installProductionGlNoisePatch} from './productionGlNoisePatch'
test('setup throws before replay: destroys real owned fake-probe and restores shader hook',async()=>{
 const saved=globalThis.WebGLRenderingContext
 class FakeGL{shaderSource(_shader:unknown,_source:string){}}
 globalThis.WebGLRenderingContext=FakeGL as unknown as typeof WebGLRenderingContext
 const original=FakeGL.prototype.shaderSource,canvas={} as HTMLCanvasElement;let destroyed=0
 try{const hook=installProductionGlNoisePatch(canvas,'subtract');assert.notEqual(FakeGL.prototype.shaderSource,original)
  await assert.rejects(withGlOwnerCleanup(()=>({destroy(){destroyed++}}),async()=>{throw new Error('captureStages setup failed')},()=>hook.restore()),/setup failed/)
  assert.equal(destroyed,1);assert.equal(FakeGL.prototype.shaderSource,original)
 }finally{FakeGL.prototype.shaderSource=original;globalThis.WebGLRenderingContext=saved}
})
test('constructor and destroy errors still run restoration exactly once',async()=>{
 let restored=0
 await assert.rejects(withGlOwnerCleanup(()=>{throw new Error('constructor')},async()=>0,()=>{restored++}),/constructor/)
 assert.equal(restored,1)
 await assert.rejects(withGlOwnerCleanup(()=>({destroy(){throw new Error('destroy')}}),async()=>42,()=>{restored++}),/destroy/)
 assert.equal(restored,2)
})
