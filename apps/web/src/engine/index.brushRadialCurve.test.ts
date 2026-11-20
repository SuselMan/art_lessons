import { expect, it, vi } from 'vitest'
import type { AssetId, BrushDescriptor } from '@grafetto/shared'
import { installBrushLibrary } from './brushLibrary'
import { installBrushPixels, importedBrushAssets } from './src/presets/importedBrushes'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { brushPreparationPlan, brushPreparationBytes, brushTextureResourceKey } from './src/dabs/BrushPreparation'
import { createTestEngine, dab, makeLayerAdd, makeStroke, paperReady } from './testing/engineTestUtils'
const lookup = `asset:${'39'.repeat(32)}` as AssetId
let ordinal=39000
function fixture(model: 'stamp'|'mixer', child=false) {
  const descriptor:BrushDescriptor={...digitalBrushFromPreset('hard-round'),id:`imported-${(++ordinal).toString(16).padStart(24,'0')}`,version:139,model,
    tip:{kind:'procedural',hardness:1,aspect:2,rotation:'fixed',angle:0,profile:{kind:'radialCurve',lookup,resolution:4,encoding:'unorm32be',antialias:false}},
    sizeByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2},
    ...(model==='mixer'?{mixer:{load:0,initialLoad:0,pickup:1,strength:1,smearAlpha:true,source:'previousCanvas' as const}}:{})}
  if(child) {
    const secondary={...descriptor,model:'stamp' as const,mixer:undefined}
    descriptor.tip={kind:'bitmap',mask:'chalk',hardness:1,aspect:1,rotation:'fixed',angle:0}
    descriptor.behavior={version:2,dual:{brush:secondary,blendMode:'multiply'}}
  }
  installBrushLibrary({schemaVersion:1,brushes:[{name:'Authored lookup',source:'qa',warnings:[],descriptor}],assets:[{id:lookup,size:8,file:'authored-lookup.raw'}],skipped:[]})
  const bytes=new Uint8Array(64),view=new DataView(bytes.buffer)
  for(let i=0;i<6;i++)view.setUint32(i*4,Math.round(i/5*4294967295),false)
  installBrushPixels(lookup,bytes)
  return {descriptor,preset:`brush:${descriptor.id}@139`}
}
it('enumerates the LUT and accounts only its packed base plane separately from ordinary masks',()=>{
  const {descriptor,preset}=fixture('stamp')
  expect(importedBrushAssets(preset)).toContain(lookup)
  const resource=brushPreparationPlan(descriptor).resources.find(r=>r.lookup32)!
  expect(brushTextureResourceKey(resource)).toBe(`t:lookup32:${lookup}`)
  expect(brushPreparationBytes([resource],()=>8)).toBe(64)
})
it.each(['stamp','mixer'] as const)('prewarms %s main and inline lookup variants, without hot uploads, and disposes their programs',async model=>{
  const {engine}=createTestEngine({}, {width:128,height:64})
  try {
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('peer','ink'))
    const gl=engine['gl'],create=vi.spyOn(gl,'createProgram'),destroy=vi.spyOn(gl,'deleteProgram'),upload=vi.spyOn(gl,'texImage2D'),uniform=vi.spyOn(gl,'uniform4f')
    for(const child of [false,true]) {
      const {preset}=fixture(model,child)
      await expect(engine.prepareBrush(preset)).resolves.toEqual({status:'ready'})
      const lookupUploads=()=>upload.mock.calls.filter(args=>{const call=args as unknown as unknown[];return call[3]===4 && call[4]===4 && call[6]===gl.RGBA && call[8] instanceof Uint8Array}).length
      const uploads=lookupUploads(),programs=create.mock.calls.length
      expect(uploads).toBe(1)
      expect(programs).toBe(1)
      for(const x of [20,40])engine.appendOperation(makeStroke('peer','ink',[dab(x,32,{size:40,aspectRatio:2})],{tool:'digitalBrush',preset,strokeId:`curve-${child}`}), 'remote')
      expect(lookupUploads()).toBe(uploads)
      expect(create.mock.calls.length).toBe(programs)
      const name=child?'u_dualProcedural':'u_tipProcedural'
      expect(uniform.mock.calls.some(([loc,...values])=>(loc as unknown as {name:string}).name===name && JSON.stringify(values)===JSON.stringify([3,4,4,0]))).toBe(true)
    }
    const owner=model==='stamp'?engine['_brush']['behavior']:engine['_smudge']
    const program=model==='stamp'?engine['_brush']['behavior']['curveStamp']?.program:engine['_smudge']['curveTransfer']?.program
    expect(program).toBeDefined()
    owner.destroy()
    expect(destroy.mock.calls.some(([p])=>p===program)).toBe(true)
  } finally {engine.destroy()}
})
it('prepares independent lookup children through stamp and rebuilds one curve capability after context loss',async()=>{
  const {descriptor}=fixture('stamp')
  const parent=fixture('mixer').descriptor
  parent.id=`imported-${(++ordinal).toString(16).padStart(24,'0')}`
  parent.tip={kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'}
  parent.behavior={version:2,dual:{brush:descriptor,blendMode:'multiply',sampling:'independent'}}
  installBrushLibrary({schemaVersion:1,assets:[{id:lookup,size:8,file:'authored-lookup.raw'}],skipped:[],brushes:[{name:'Independent lookup',source:'qa',warnings:[],descriptor:parent}]})
  const preset=`brush:${parent.id}@139`, {engine}=createTestEngine({}, {width:64,height:64})
  try {
    await paperReady(engine)
    await engine.prepareBrush(preset)
    const painter=engine['_brush']['behavior'], old=painter['curveStamp']?.program
    expect(old).toBeDefined()
    expect(engine['_smudge']['curveTransfer']).toBeUndefined()
    painter.initGL()
    expect(painter['curveStamp']).toBeUndefined()
    await engine.prepareBrush(preset)
    expect(painter['curveStamp']?.program).toBeDefined()
    expect(painter['curveStamp']?.program).not.toBe(old)
  } finally {engine.destroy()}
})
