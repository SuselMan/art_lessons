import test from 'node:test'
import assert from 'node:assert/strict'
import {installProductionGlNoisePatch} from './productionGlNoisePatch'
test('GL noise hook patches only target canvas, hashes inputs, restores exact method',async()=>{
 const saved=globalThis.WebGLRenderingContext
 class FakeGL{canvas:unknown;received:string[]=[];constructor(canvas:unknown){this.canvas=canvas}shaderSource(_shader:unknown,source:string){this.received.push(source)}}
 globalThis.WebGLRenderingContext=FakeGL as unknown as typeof WebGLRenderingContext
 const target={} as HTMLCanvasElement,other={} as HTMLCanvasElement,baseline=FakeGL.prototype.shaderSource
 try{const hook=installProductionGlNoisePatch(target,'subtract'),a=new FakeGL(target),b=new FakeGL(other)
  a.shaderSource({},'vec2 i = floor(p); vec2 f = fract(p);');b.shaderSource({},'vec2 i = floor(p); vec2 f = fract(p);');a.shaderSource({},'unrelated')
  assert.match(a.received[0],/f = p - i/);assert.match(b.received[0],/fract/);assert.equal(a.received[1],'unrelated')
  const report=await hook.report();assert.equal(report.changedPrograms,1);assert.notEqual(report.sources[0].originalSha256,report.sources[0].patchedSha256)
  hook.restore();assert.equal(FakeGL.prototype.shaderSource,baseline)
  const off=installProductionGlNoisePatch(target);assert.equal(FakeGL.prototype.shaderSource,baseline);off.restore()
 }finally{FakeGL.prototype.shaderSource=baseline;globalThis.WebGLRenderingContext=saved}
})
