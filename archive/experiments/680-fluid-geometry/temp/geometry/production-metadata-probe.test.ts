import { it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { RibbonStrokePainter, type RibbonStrokePainterContext } from './RibbonStrokePainter'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { type RibbonScratchPool } from '../buffers/RibbonScratchPool'
import { ribbonProfileFor } from './ribbonProfile'
import { presetForTool } from '../presets/resolvePreset'
import { dabWorldHalfExtents } from './StampPainter'
import { watercolorSpreadBudget, WC_FRONT_FLOOR, WC_RIM_BAND_PX } from '../presets/watercolorPresets'
import { WET_DIFFUSE_REACH } from '../watercolor/wetDiffusion'
import { WC_HALF_RES_RADIUS_PX, WC_HALF_RES_SPAN_PX } from '../watercolor/settleResolution'
import { brushDragContacts } from '../watercolor/brushDrag'
import type { Dab } from '@grafetto/shared'

it('captures production geometry/contact metadata with no GPU target allocated', () => {
 const run=(presetName:string, wet:number, step=12, start=400)=>{
  const reaches:any[]=[],profile=ribbonProfileFor('watercolor',presetName,wet),preset=presetForTool('watercolor',presetName)
  const scratch=new RibbonStrokeScratch({} as RibbonScratchPool,true,true)
  const ctx={minmaxExt:()=>({MAX_EXT:1}),infinite:()=>false,pageSize:()=>({w:3000,h:2000}),dabWorldHalfExtents,
   wcSheetClamp:(r:any)=>r,resolveWithinSheet:(_target:any,r:any)=>{reaches.push(r);return[]},
   dabPool:()=>new WeakMap(),markerSegmentLength:(d:Dab,prev:Dab|undefined,r:number)=>!prev?r*.5:Math.hypot(d.x-prev.x,d.y-prev.y)>0.01?Math.hypot(d.x-prev.x,d.y-prev.y):r*.12,
  } as unknown as RibbonStrokePainterContext
  const painter=new RibbonStrokePainter(ctx);painter.diagnosticSegmentDelivery='combined';painter.diagnosticWaterPolicy='bottomless';painter.diagnosticSharedFluid=true;painter.diagnosticForeignSolvent=false;painter.diagnosticSolventField=false;painter.diagnosticLandingPolicy='fluid'
  const dabs=Array.from({length:20},(_,i)=>({x:start+i*step,y:start===400?500:1000,size:120,opacity:1,aspectRatio:1,angle:0,pressure:1,t:i*16,speed:.5})) as Dab[]
  for(const _ of painter.paint({} as any,dabs,preset,presetName,profile,[.22,0,.6],scratch,undefined,(wet?'f':'0').repeat(dabs.length)))void _
  const union={minX:Math.min(...reaches.map(r=>r.minX)),minY:Math.min(...reaches.map(r=>r.minY)),maxX:Math.max(...reaches.map(r=>r.maxX)),maxY:Math.max(...reaches.map(r=>r.maxY))}
  const contacts=brushDragContacts(scratch.brushTravel,{x:0,y:0,w:3000,h:2000})
  const composite=(scratch as any)._composite;const compositePad=composite.spreadPx>0?Math.ceil(composite.spreadPx*2+profile.wetEdgeRadiusPx+(scratch as any)._dabSpacing+composite.migratePx+profile.aaPx)+1:0;
  const frontReach=Math.ceil(watercolorSpreadBudget(60,1,1)/WC_FRONT_FLOOR),dryMargin=Math.max(2,Math.min(WC_RIM_BAND_PX,Math.round(60/5)))+2+60+2,pad=Math.max(WET_DIFFUSE_REACH,frontReach)+1+dryMargin;const width=Math.ceil(union.maxX+compositePad)+pad-Math.floor(union.minX-compositePad)+pad;const S=60>=WC_HALF_RES_RADIUS_PX&&width>WC_HALF_RES_SPAN_PX?2:1;
  return{presetName,wet,profile:{inkEdgeFalloff:profile.inkEdgeFalloff,spreadOfRadius:profile.spreadOfRadius,edgeSoft:profile.edgeSoft,cloud:profile.cloud,migrate:profile.migrate,dryContact:profile.dryContact},union,compositePad,window:{pad,width,S},wetContacts:scratch.wetContacts.length,travel:scratch.brushTravel.length,contacts:contacts.length,standing:Array.from(scratch.standing.values()),availableStanding:Array.from(scratch.standing.values(),s=>Math.max(wet,s)),sampleTravel:scratch.brushTravel[0]}
 }
 const direct=run('normal:100:100:PB29:round',0),foreign=run('normal:0:100:PB29:round',1)
 expect(direct.availableStanding.every(w=>w===1)).toBe(true);expect(foreign.availableStanding.every(w=>w===1)).toBe(true)
 expect(direct.travel).toBe(19);expect(foreign.travel).toBe(0);expect(direct.wetContacts).toBe(0);expect(foreign.wetContacts).toBe(20)
 const candidateTravel=Array.from({length:19},(_,i)=>({x:412+i*12,y:500,radius:60,aspect:1,angle:0,dx:12,dy:0,water:1}));const candidateContacts=brushDragContacts(candidateTravel,{x:0,y:0,w:3000,h:2000});expect(candidateContacts.length).toBe(direct.contacts);
 const sameBrushWet=run('normal:100:100:PB29:round',1);const thresholdDry=run('normal:100:100:PB29:round',0,13,1000),thresholdWet=run('normal:100:100:PB29:round',1,13,1000);expect(sameBrushWet.travel).toBe(direct.travel);expect(thresholdDry.window.S).toBe(1);expect(thresholdWet.window.S).toBe(2);
 writeFileSync('../../temp/geometry/production-metadata.json',JSON.stringify({direct,foreign,sameBrushWet,thresholdDry,thresholdWet,candidate:{travel:candidateTravel.length,contacts:candidateContacts.length}},null,2))
})
