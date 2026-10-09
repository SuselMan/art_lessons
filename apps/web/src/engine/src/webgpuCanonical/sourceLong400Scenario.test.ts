import {it,expect} from 'vitest'
import type {Dab} from '@grafetto/shared'
import {WATERCOLOR_PRESET} from '../presets/watercolorPresets'
import {ribbonProfileFor} from '../dabs/ribbonProfile'
import {createCanonicalStrokeChunkState,prepareCanonicalStrokeChunk} from '../dabs/canonicalStrokeChunk'
it('predetermined water400 300→600→300 CPU recipe contains coverage ribbon before any hardware run',()=>{
 const x=[...Array.from({length:16},(_,i)=>300+i*20),...Array.from({length:15},(_,i)=>580-i*20)]
 const dabs:Dab[]=x.map((x,i)=>({x,y:400,size:400,pressure:.7,aspectRatio:1,angle:0,opacity:1,tiltX:0,tiltY:0,t:i*25}))
 const presetName='normal:100:0:PB29:round',profile=ribbonProfileFor('watercolor',presetName,0)
 const options={diagnosticWaterPolicy:'bottomless' as const,diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid' as const,diagnosticCanonicalSettleRadius:true,diagnosticSolventField:true,diagnosticPigmentRecord:true}
 const source=prepareCanonicalStrokeChunk(createCanonicalStrokeChunkState(),{dabs,preset:WATERCOLOR_PRESET,presetName,profile,color:[.2,.1,.5],tile:{originX:0,originY:0,buffer:{width:1024,height:1024}},film:true,segmentMode:'combined',options,waterOnly:true})
 expect(source.commands.some(x=>x.kind==='ribbon'&&x.phase==='coverage'&&x.batch.vertices.length>0)).toBe(true)
 const state=createCanonicalStrokeChunkState(),stream=dabs.flatMap(dab=>prepareCanonicalStrokeChunk(state,{dabs:[dab],preset:WATERCOLOR_PRESET,presetName,profile,color:[.2,.1,.5],tile:{originX:0,originY:0,buffer:{width:1024,height:1024}},film:true,segmentMode:'combined',options,waterOnly:true}).commands)
 expect(stream.some(x=>x.kind==='ribbon'&&x.phase==='coverage'&&x.batch.vertices.length>0)).toBe(true)
 expect(dabs.every(d=>d.x-200>=0&&d.x+200<=1024&&d.y-200>=0&&d.y+200<=1024)).toBe(true)
})
