import {expect,it} from 'vitest'
import {RibbonPasses,type RibbonPassesContext} from '../../../../apps/web/src/engine/src/raster/RibbonPasses'
import {ribbonProfileFor} from '../../../../apps/web/src/engine/src/dabs/ribbonProfile'
import {ribbonWaterDelivery} from '../../../../apps/web/src/engine/src/dabs/ribbonStrokeMath'
import type {CanonicalDrawCommand} from '../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
import type {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import type {PaintTarget} from '../../../../apps/web/src/engine/src/buffers/ILayerBuffer'
import type {PencilPreset} from '../../../../apps/web/src/engine/src/presets/pencilPresets'
import type {Dab} from '@grafetto/shared'
import {drawPreparedGlSource,createPreparedGlSourcePort} from './PreparedGlSourceDraw'

it('direct stamp binding matches the existing program ordered calls without reconstructing Dab.size',()=>{
 for(const nib of ['round','chisel'])for(const phase of ['coverage','solvent','pigment','color','halo'] as const)for(const blend of ['max','add'] as const){
  let trace:unknown[][]=[]
  const constants:Record<string,number>={TEXTURE0:33984,TEXTURE2:33986,TEXTURE_2D:3553,ARRAY_BUFFER:34962,FLOAT:5126,TRIANGLES:4}
  const gl=new Proxy(constants,{get:(o,k)=>k in o?o[String(k)]:(...args:unknown[])=>trace.push([k,...args.map(a=>ArrayBuffer.isView(a)?Array.from(a as Float32Array):a)])}) as unknown as WebGLRenderingContext
  const uniforms=new Proxy({}, {get:(_o,k)=>String(k)})
  const stamps={program:'stamp-program',uniforms,positionLoc:3,bindNoise:(x:unknown)=>trace.push(['bindNoise',x])}
  const ctx={gl:()=>gl,stamps:()=>stamps,paperTex:()=> 'paper',quadBuf:()=> 'quad',minmaxExt:()=>({MAX_EXT:32776})} as unknown as RibbonPassesContext
  const ribbon=new RibbonPasses(ctx),dest={width:1024,height:1024,beginDraw:()=>trace.push(['beginDraw']),beginMaxDraw:()=>trace.push(['beginMaxDraw']),beginAdditiveDraw:()=>trace.push(['beginAdditiveDraw']),endDraw:()=>trace.push(['endDraw'])} as unknown as AccumulationBuffer
  const tile={originX:1024,originY:-1024,buffer:dest} as PaintTarget,coverage={texture:'coverage'} as unknown as AccumulationBuffer
  const p={...ribbonProfileFor('watercolor',`normal:100:100:PB29:${nib}`,0),diagnosticReadFluid:phase==='halo'},preset={sizeMultiplier:1.37,hardness:.63} as PencilPreset
  const dab={x:1102.125,y:-942.5,size:37.13,pressure:.031,angle:.731,aspectRatio:1.87} as Dab
  const radius=37.13*.5*1.37,water=ribbonWaterDelivery(p),color=phase==='color',clip=phase==='halo',tau=[.1,.2,.7] as const
  const command:CanonicalDrawCommand={kind:'stamp',phase,inkMode:phase==='coverage'?6:7,stamp:{center:[78.125,81.5],radius,aspect:1.87,angle:.731,pressure:.031,opacity:.42,nibShape:p.nibShape,cornerRadius:radius*p.cornerFraction,inkEdge:p.inkEdgeFalloff,inkWater:.73,paperWet:.28,inkStrength:.81,puddle:.64,pigmentPool:.64,acrossLocal:[-.2,.98],inkClip:clip?2:0,inkBlend:blend,uniforms:{aaPx:p.aaPx,washWater:water.water,waterRetain:water.retain,bristleCombs:2.3,bristleInk:.6,tau,worldOrigin:[1024,1024],mottleSeed:[12,-7],cloudDeposit:p.cloud,granDeposit:p.granulation,poolBlot:.35,useAvailableWater:clip}}}
  if(phase!=='coverage'){if(blend==='max')dest.beginMaxDraw({MAX_EXT:32776});else dest.beginAdditiveDraw()}
  ribbon.drawRibbonNibPass(dest,tile,dab,preset,p,command.inkMode,.42,phase==='coverage',.73,[-.2,.98],.28,.81,[12,-7],clip?coverage:null,2.3,.6,color?tau:null,.64,.35)
  if(phase!=='coverage')dest.endDraw()
  const original=trace;trace=[];drawPreparedGlSource(command,dest,coverage,tile,ctx,ribbon,.63);expect(trace).toEqual(original)
 }
})

it('ribbon forwards captured Float32 geometry and colour uniforms unchanged; rejects a stale tile origin before GL',()=>{
 const vertices=new Float32Array([1,-0,3,4,5,6,7,8,9,10,11]),calls:unknown[][]=[]
 const command:CanonicalDrawCommand={kind:'ribbon',phase:'color',batch:{vertices,inkBlend:'max',uniforms:{aaPx:1,washWater:.8,waterRetain:1,bristleCombs:3,bristleInk:.2,tau:[.2,.4,.9],worldOrigin:[1024,1024],mottleSeed:[-3,7],cloudDeposit:.1,granDeposit:.5,poolBlot:.4,useAvailableWater:true}}}
 const dest={} as AccumulationBuffer,coverage={} as AccumulationBuffer,tile={originX:1024,originY:-1024} as PaintTarget,ribbon={drawRibbonBands:(...args:unknown[])=>calls.push(args)} as unknown as RibbonPasses
 drawPreparedGlSource(command,dest,coverage,tile,{} as RibbonPassesContext,ribbon,.5)
 expect(calls).toEqual([[dest,tile,vertices,'ink-max',1,.1,.5,[-3,7],.8,1,3,.2,[.2,.4,.9],.4,coverage]])
 expect(calls[0][2]).toBe(vertices);expect(new Uint32Array(vertices.buffer)[1]).toBe(2147483648)
 expect(()=>drawPreparedGlSource(command,dest,coverage,{originX:0,originY:0} as PaintTarget,{} as RibbonPassesContext,ribbon,.5)).toThrow('origin mismatch');expect(calls).toHaveLength(1)
})

it('GL port delegates late-bound copies and original mode1 sum; rejects feedback and changed blending',()=>{
 const calls:unknown[][]=[],field=(name:string)=>({texture:{name},clear:()=>calls.push(['clear',name]),copyTo:(destination:AccumulationBuffer)=>calls.push(['copy',name,destination.texture])})as unknown as AccumulationBuffer
 const load=field('load'),base=field('base'),film=field('film'),port=createPreparedGlSourcePort({bindCurrentCanonical:()=>{throw Error('latebind')},tile:{}as PaintTarget,context:{}as RibbonPassesContext,ribbon:{}as RibbonPasses,presetHardness:.4,watercolor:{fieldOp:(...args:unknown[])=>calls.push(args)}as never})
 expect(()=>port.bindCurrentCanonical()).toThrow('latebind');port.clear(film);port.copy(load,base);port.basePlusFilm(load,base,film,[1,2,3,4]);expect(calls).toEqual([['clear','film'],['copy','load',base.texture],[load,base,film,1,1,{scissor:[1,2,3,4]}]])
 expect(()=>port.copy(load,load)).toThrow('distinct');expect(()=>port.basePlusFilm(load,load,film,[1,2,3,4])).toThrow('feedback')
 const command={kind:'ribbon',phase:'pigment',batch:{inkBlend:'max'}}as CanonicalDrawCommand
 expect(()=>port.draw(command,film,base,'add')).toThrow('blend mismatch');expect(()=>port.draw(command,film,film,'max')).toThrow('feedback')
})
