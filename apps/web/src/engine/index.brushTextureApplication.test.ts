import type { MockGL } from './testing/mockGL'
import { expect, it, vi } from 'vitest'
import type { BrushDescriptor } from '@grafetto/shared'
import { installBrushLibrary, installBrushPixels } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { createTestEngine, dab, makeLayerAdd, makeStroke, paperReady } from './testing/engineTestUtils'
import { brushPreparationBytes, brushPreparationResources } from './src/dabs/BrushPreparation'

let sequence=1800
function fixture(model:'stamp'|'mixer',application:boolean,child?:BrushDescriptor,independent=false) {
  const id=`asset:${'e'.repeat(64)}` as const
  installBrushPixels(id,new Uint8Array(64).fill(127))
  const descriptor:BrushDescriptor={...digitalBrushFromPreset('hard-round'),id:`imported-${(++sequence).toString(16).padStart(24,'0')}`,version:112,model,
    texture:{id,strength:1,periodPx:5,...(application?{application:{mode:'subtract' as const,soft:false},patternSize:{width:5,height:3},offset:{x:2,y:1,randomX:false,randomY:false}}:{})},
    ...(model==='mixer'?{mixer:{load:0,initialLoad:0,pickup:1,strength:1,source:'previousCanvas' as const,smearAlpha:true}}:{}),
    behavior:{version:2,...(child?{dual:{brush:child,blendMode:'multiply' as const,...(independent?{sampling:'independent' as const}:{})}}:{})}}
  installBrushLibrary({schemaVersion:1,brushes:[{name:'Own texture application',source:'qa',warnings:[],descriptor}],assets:[{id,size:8,file:`${id.slice(6)}.bin`}],skipped:[]})
  return{descriptor,preset:`brush:${descriptor.id}@112`}
}

it('keeps same-asset legacy and discrete inline-dual samplers separate and prepare warm',async()=>{
  const child=fixture('stamp',true).descriptor,{descriptor,preset}=fixture('stamp',false,child),{engine}=createTestEngine({}, {width:64,height:64})
  try {
    await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
    const gl=engine['gl'],upload=vi.spyOn(gl,'texImage2D'),uniform=vi.spyOn(gl,'uniform4f')
    await engine.prepareBrush(preset)
    const uploads=()=>upload.mock.calls.filter(call=>call[1]===0&&call[2]===gl.LUMINANCE&&call[3]===8)
    expect(uploads()).toHaveLength(2)
    const resources=brushPreparationResources(descriptor).filter(r=>r.id===descriptor.texture!.id)
    expect(resources.map(r=>!!r.discrete).sort()).toEqual([false,true])
    expect(brushPreparationBytes(resources,()=>8)).toBe((64+16+4+1)*4+64*4)
    const legacy=engine['_brush']['textures'].get(`g:${descriptor.texture!.id}`)!,grid=engine['_brush']['textures'].get(`g:grid:${descriptor.texture!.id}`)!
    expect(grid).not.toBe(legacy)
    expect((gl as unknown as MockGL).getMinFilter(legacy)).toBe(gl.LINEAR_MIPMAP_LINEAR)
    expect((gl as unknown as MockGL).getMinFilter(grid)).toBe(gl.NEAREST)
    engine.appendOperation(makeStroke('peer','ink',[dab(16,32),dab(32,32)],{tool:'digitalBrush',preset,strokeEnd:true}),'remote')
    expect(uploads()).toHaveLength(2)
    const modes=(name:string)=>uniform.mock.calls.filter(([loc])=>(loc as unknown as{name:string}).name===name).map(call=>call[1])
    expect(modes('u_textureApplication')).toContain(0);expect(modes('u_dualTextureApplication')).toContain(2)
    expect(engine['_brush']['textures'].bytes).toBeLessThanOrEqual(16*1024*1024)
  } finally {engine.destroy()}
})

it.each([false,true])('routes texture applications through mixer primary and %s independent child',async independent=>{
  const child=fixture('stamp',true).descriptor,{preset}=fixture('mixer',true,child,independent),{engine}=createTestEngine({}, {width:64,height:64})
  try {
    await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
    const uniform=vi.spyOn(engine['gl'],'uniform4f'),upload=vi.spyOn(engine['gl'],'texImage2D')
    await engine.prepareBrush(preset)
    const count=upload.mock.calls.length
    engine.appendOperation(makeStroke('peer','ink',[dab(16,32),dab(32,32)],{tool:'digitalBrush',preset,strokeEnd:true}),'remote')
    const values=(name:string)=>uniform.mock.calls.filter(([loc])=>(loc as unknown as{name:string}).name===name).map(call=>call.slice(1))
    expect(values('u_textureApplication')).toContainEqual([2,0,5,3])
    expect(values('u_dualTextureApplication')).toContainEqual(independent?[0,0,1,1]:[2,0,5,3])
    // Only scratch RGBA allocations may follow preparation; no new grid upload.
    expect(upload.mock.calls.slice(count).filter(call=>call[2]===engine['gl'].ALPHA||call[2]===engine['gl'].LUMINANCE)).toHaveLength(0)
  } finally {engine.destroy()}
})
