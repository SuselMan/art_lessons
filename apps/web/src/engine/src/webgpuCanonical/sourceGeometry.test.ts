import { expect,it,vi } from 'vitest'
import type { Dab } from '@grafetto/shared'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { createCanonicalStrokeChunkState,prepareCanonicalStrokeChunk } from '../dabs/canonicalStrokeChunk'
import { canonicalSourceGeometry } from './sourceGeometry'
import { ribbonProfileFor } from '../dabs/ribbonProfile'

it.each(['round','chisel'].flatMap(nib=>['0','f'].flatMap(wet=>[12,400].flatMap(size=>[false,true].map(bridge=>({nib,wet,size,bridge}))))) )('production source geometry exact $nib wet=$wet size=$size bridge=$bridge',({nib,wet,size,bridge})=>{
 const {engine}=createTestEngine({paper:'flat'},{width:64,height:64});engine.initLayer('L');const e=engine as any,painter=e._ribbonPainter,ctx=painter.ctx
 vi.spyOn(ctx,'pageSize').mockReturnValue({w:1024,h:1024});vi.spyOn(ctx,'minmaxExt').mockReturnValue({MAX_EXT:0x8008})
 const tile={originX:0,originY:0,buffer:e._ribbonScratchPool.acquire(1024,1024)}
 vi.spyOn(ctx,'resolveWithinSheet').mockReturnValue([tile]);vi.spyOn(ctx,'drawRibbonNibPass').mockImplementation(()=>{});vi.spyOn(ctx,'drawRibbonBands').mockImplementation(()=>{});vi.spyOn(ctx,'drawRibbonCompositeRect').mockImplementation(()=>{})
 painter.diagnosticSegmentDelivery='combined';painter.diagnosticForeignSolvent=false
 const rects:any[]=[],spy=vi.spyOn(ctx,'revealRect').mockImplementation((_tile,bounds)=>{rects.push({...bounds as {minX:number;minY:number;maxX:number;maxY:number}});return null})
 const name=`normal:100:100:PB29:${nib}`,preset=e._resolvePreset('watercolor',name),profile=ribbonProfileFor('watercolor',name,Number.parseInt(wet,16)/15)
 const dab:Dab={x:400,y:420,size,pressure:.8,aspectRatio:nib==='chisel'?2:1,angle:.7,opacity:.8,tiltX:0,tiltY:0,t:0},scratch=new RibbonStrokeScratch(e._ribbonScratchPool,true,true)
 const previous=bridge?{...dab,x:350,y:400}:undefined
 const options={diagnosticWaterPolicy:painter.diagnosticWaterPolicy,diagnosticSharedFluid:painter.diagnosticSharedFluid,diagnosticLandingReservoir:painter.diagnosticLandingReservoir,diagnosticLandingPolicy:painter.diagnosticLandingPolicy,diagnosticCanonicalSettleRadius:painter.diagnosticCanonicalSettleRadius,diagnosticSolventField:painter.diagnosticSolventField,diagnosticPigmentRecord:painter.diagnosticPigmentRecord}
 try{
  for(const _ of painter.paint(e._layers.get('L'),[dab],preset,name,profile,[.2,.3,.5],scratch,previous,wet,[1,2]))void _
  const state=createCanonicalStrokeChunkState(),native=prepareCanonicalStrokeChunk(state,{dabs:[dab],previous,preset,presetName:name,profile,color:[.2,.3,.5],wetProfile:wet,strokeSeed:[1,2],tile:{originX:0,originY:0,buffer:{width:1024,height:1024}},film:true,segmentMode:'combined',segmented:true,options})
  const geometry=canonicalSourceGeometry(native.drawable,previous,preset,profile,wet,state,{dabSpacing:0},{w:1024,h:1024},options.diagnosticCanonicalSettleRadius)
  expect(scratch.finishContext!.bounds).toEqual(geometry.bounds);expect(scratch.finishContext!.radiusPx).toBe(geometry.nibRadius)
  expect(rects.length).toBeGreaterThan(0);for(const rect of rects)expect(rect).toEqual(geometry.compositeBounds)
 }finally{spy.mockRestore();scratch.destroy();engine.destroy()}
})
