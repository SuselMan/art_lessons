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
import {presetForTool} from '../../../../apps/web/src/engine/src/presets/resolvePreset'
import {ribbonProfileFor} from '../../../../apps/web/src/engine/src/dabs/ribbonProfile'
import {createCanonicalStrokeChunkState,prepareCanonicalStrokeChunk} from '../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
// @ts-expect-error QA executable module has no declaration file.
import {residualKnownSourceDabs} from './residualSourceGpu.mjs'
test('known nonempty source fixture prepares genuine ordered pigment stamp and bands',()=>{
 const name='normal:100:100:PB29:round',preset=presetForTool('watercolor',name),profile=ribbonProfileFor('watercolor',name,0)
 expect(profile.pigmentLevel).toBeGreaterThan(0)
 const result=prepareCanonicalStrokeChunk(createCanonicalStrokeChunkState(),{dabs:residualKnownSourceDabs(),preset,presetName:name,profile,color:[.2,.1,.5],wetProfile:'0f37',strokeSeed:[1,2],tile:{originX:0,originY:0,buffer:{width:1024,height:1024}},film:true,segmentMode:'combined',options:{diagnosticSolventField:true,diagnosticPigmentRecord:true}})
 const colour=result.commands.filter(c=>c.phase==='color')
 expect(colour.length).toBeGreaterThan(0)
 expect(colour.some(c=>c.kind==='stamp')).toBe(true)
 expect(colour.some(c=>c.kind==='ribbon')).toBe(true)
 expect(colour.some(c=>(c.kind==='stamp'?c.stamp.uniforms:c.batch.uniforms).tau.some(v=>v>0))).toBe(true)
})
