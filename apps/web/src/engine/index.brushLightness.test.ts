import { expect,it,vi } from 'vitest'
import type { BrushDescriptor } from '@grafetto/shared'
import { installBrushLibrary,installBrushPixels } from './brushLibrary'
import { importedBrushAssets } from './src/presets/importedBrushes'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { createTestEngine,makeLayerAdd,makeStroke,paperReady,dab,brushDraws } from './testing/engineTestUtils'

it('prepares paired material variants once and reuses them on first draw and replay without an extra sampler',async()=>{
  const alpha=`asset:${'d1'.repeat(32)}` as const,gray1=`asset:${'d2'.repeat(32)}` as const,gray2=`asset:${'d3'.repeat(32)}` as const
  const descriptor:BrushDescriptor={...digitalBrushFromPreset('hard-round'),id:'imported-'+'d'.repeat(24),version:115,
    tip:{kind:'bitmap',mask:alpha,animation:{mode:'incremental',frames:[alpha,alpha]},material:{kind:'lightness',gray:gray1,grayFrames:[gray1,gray2],strength:1},hardness:1,aspect:1,angle:0,rotation:'fixed'},behavior:{version:2}}
  const ids=[alpha,gray1,gray2],preset=`brush:${descriptor.id}@115`
  installBrushLibrary({schemaVersion:1,brushes:[{name:'Own lightness fixture',source:'qa',warnings:[],descriptor}],assets:ids.map(id=>({id,size:2,file:id.slice(6)+'.bin'})),skipped:[]})
  ids.forEach((id,i)=>installBrushPixels(id,new Uint8Array(4).fill(i===0 ? 255 : i===1 ? 64 : 255)))
  expect(importedBrushAssets(preset)).toEqual(ids)
  const {engine}=createTestEngine({}, {width:32,height:32})
  try{
    await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
    const gl=engine['gl'],uploads=vi.spyOn(gl,'texImage2D')
    await engine.prepareBrush(preset)
    const paired=()=>uploads.mock.calls.filter(call=>call[1]===0 && call[2]===gl.LUMINANCE_ALPHA)
    expect(paired()).toHaveLength(2)
    expect(paired().map(call=>Array.from((call as unknown as unknown[])[8] as Uint8Array))).toEqual([[64,255,64,255,64,255,64,255],[255,255,255,255,255,255,255,255]])
    await engine.prepareBrush(preset);expect(paired()).toHaveLength(2)
    const operation=makeStroke('peer','ink',[dab(10,16),dab(15,16),dab(20,16)],{tool:'digitalBrush',preset,strokeId:'lightness',strokeEnd:true})
    engine.appendOperation(operation,'remote')
    expect(paired()).toHaveLength(2)
    const draws=brushDraws(engine).filter(draw=>draw.kind==='stamp')
    expect(draws.length).toBeGreaterThan(0)
    expect(draws.every(draw=>draw.uniforms.get('u_lightnessMaterial')===1 && draw.uniforms.get('u_lightnessStrength')===1)).toBe(true)
    expect(draws.every(draw=>draw.uniforms.get('u_tip')===1)).toBe(true)
    expect(engine['_brush']['textures'].bytes).toBeLessThanOrEqual(16*1024*1024)
  }finally{engine.destroy()}
})
