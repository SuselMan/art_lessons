import {test,expect} from 'vitest'
import {WatercolorPasses} from '../../../../apps/web/src/engine/src/raster/WatercolorPasses'
// @ts-expect-error QA executable module has no declaration file.
import {residualFixtureDrawTarget} from './residualSourceGpu.mjs'
test('actual production wcResample invokes descriptor begin/end around draw',()=>{
 const calls:unknown[][]=[]
 const gl=new Proxy({},{get:(_target,key)=>typeof key==='string'&&key===key.toUpperCase()?key:(...args:unknown[])=>calls.push([key,...args])}) as WebGLRenderingContext
 const passes=new WatercolorPasses({gl:()=>gl,screenBuf:()=>({}) as WebGLBuffer,paperTex:()=>({}) as WebGLTexture,paperScale:()=>1,paperWorldSize:()=>({w:1024,h:1024}),stamps:()=>null!})
 Object.assign(passes,{_resampleUni:{},_resampleProg:{},_resamplePosLoc:0})
 const f={width:128,height:128,texture:{},fbo:{},format:'rgba32f'},out=residualFixtureDrawTarget(gl,f)
 passes.wcResample(out,0,0,128,128,{width:1024,height:1024,texture:{}} as never,0,0,8,0)
 expect(calls[0]).toEqual(['bindFramebuffer','FRAMEBUFFER',f.fbo])
 expect(calls[1]).toEqual(['viewport',0,0,128,128])
 const draw=calls.findIndex(c=>c[0]==='drawArrays')
 expect(draw).toBeGreaterThan(1)
 expect(calls.slice(draw+1)).toContainEqual(['bindFramebuffer','FRAMEBUFFER',null])
 expect(f).not.toHaveProperty('beginReplaceDraw')
})
