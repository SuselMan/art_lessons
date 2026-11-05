import {expect,it,vi} from 'vitest'
import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {installBrushLibrary,installBrushPixels} from '../../brushLibrary'
import {createTestEngine,dab,makeLayerAdd,makeStroke,paperReady} from '../../testing/engineTestUtils'
import {digitalBrushFromPreset} from '../presets/digitalBrushPresets'
let serial=0x3500
function fixture(image:boolean,mean=false,modern=false){
 const id=`asset:${(++serial).toString(16).padStart(64,'0')}` as const
 const descriptor:BrushDescriptor={...digitalBrushFromPreset('hard-round'),id:'imported-'+(++serial).toString(16).padStart(24,'0'),version:35,model:'mixer',paperInteraction:0,
 tip:image?{kind:'bitmap',mask:id,hardness:1,aspect:1,angle:0,rotation:'fixed',imageSampling:{kind:'integer-pyramid',signal:'inverse-gray',sourceRect:{x:1,y:1,width:3,height:5}}}:{kind:'procedural',hardness:1,aspect:1,angle:0,rotation:'fixed',profile:{kind:'standard',shape:'rectangle',horizontalFade:1,verticalFade:1,antialias:true}},
 sizeByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2},mixer:{load:0,initialLoad:0,pickup:1,strength:1,source:'previousCanvas',smearAlpha:true,...(modern?{algorithm:'krita-mask' as const}:{}),...(mean?{sampling:{mode:modern?'maskMean' as const:'uniformMean' as const,radius:1}}:{})}}
 installBrushLibrary({schemaVersion:1,brushes:[{name:'Authored smearing',source:'qa',warnings:[],descriptor}],assets:image?[{id,size:8,file:'authored.bin'}]:[],skipped:[]});if(image)installBrushPixels(id,new Uint8Array(64).fill(255));return `brush:${descriptor.id}@35`
}
it.each([false,true])('keeps actual mask/source placement deterministic across whole and chunk replay: bitmap%s',async image=>{
 const preset=fixture(image)
 const run=async(chunked:boolean)=>{
  const {engine}=createTestEngine({}, {width:80,height:64})
  try{
   await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
   const painter=engine['_smudge'] as unknown as {drawTransferDab:(...args:unknown[])=>void;gatherPatch:(...args:unknown[])=>void}
   const draw=vi.spyOn(painter,'drawTransferDab'),gather=vi.spyOn(painter,'gatherPatch'),scissor=vi.spyOn(engine['gl'],'scissor')
   if(chunked){
    Object.defineProperty(engine['gl'],'SCISSOR_BOX',{value:0x0c10})
    const gl=engine['gl'],get=gl.getParameter.bind(gl)
    vi.spyOn(gl,'getParameter').mockImplementation(name=>name===0x0c10?new Int32Array([0,0,80,64]):get(name))
    gl.enable(gl.SCISSOR_TEST)
   }
   const input=[dab(20.25,30.25,{size:5}),dab(30.75,30.75,{size:4}),dab(40.25,30.25,{size:5})]
   const append=(dabs:Dab[],end:boolean)=>engine.appendOperation(makeStroke('peer','ink',dabs,{tool:'digitalBrush',preset,strokeId:'smear-geometry',...(end?{strokeEnd:true as const}:{})}),'remote')
   if(chunked){append(input.slice(0,1),false);expect(draw).not.toHaveBeenCalled();append(input.slice(1),true)}else append(input,true)
   const contacts=draw.mock.calls.map(call=>{const wet=call[9] as {smearPlacement:{rect:unknown;placedCenter:unknown;maskCenter:unknown}};return {dab:call[1],placement:wet.smearPlacement}})
   expect(contacts).toHaveLength(2);expect(scissor).toHaveBeenCalled()
   expect(engine['gl'].isEnabled(engine['gl'].SCISSOR_TEST)).toBe(chunked)
   if(chunked)expect(scissor).toHaveBeenLastCalledWith(0,0,80,64)
   return {contacts,patches:gather.mock.calls.map(call=>call[2])}
  }finally{engine.destroy()}
 }
 const full=await run(false);expect(await run(true)).toEqual(full)
 const second=full.contacts[0]
 expect((second.dab as Dab).x).toBeCloseTo(image?30.2:30)
 expect(second.placement.placedCenter).toEqual({x:image?30.5:30,y:30})
 const [source,destination]=full.patches as {minX:number;minY:number}[]
 expect(source.minX-destination.minX).toBe(-11)
 expect(source.minY-destination.minY).toBe(-1)
})
it('retains dulling fractional frame and never attaches the smearing clip contract',async()=>{
 const preset=fixture(false,true),{engine}=createTestEngine({}, {width:80,height:64})
 try{
  await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
  const p=engine['_smudge'] as unknown as {drawTransferDab:(...args:unknown[])=>void},draw=vi.spyOn(p,'drawTransferDab')
  engine.appendOperation(makeStroke('peer','ink',[dab(20.25,30.25,{size:5}),dab(30.75,30.75,{size:5})],{tool:'digitalBrush',preset,strokeEnd:true}),'remote')
  expect(draw).toHaveBeenCalled();for(const call of draw.mock.calls){expect((call[1] as Dab).x).toBe(30.75);expect((call[9] as {smearPlacement?:unknown}).smearPlacement).toBeUndefined()}
 }finally{engine.destroy()}
})

it.each([false,true])('modern mask path keeps per-gesture state across chunks: dulling%s',async mean=>{
 const preset=fixture(false,mean,true),{engine}=createTestEngine({}, {width:80,height:64})
 try{
  await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
  const painter=engine['_smudge'] as unknown as {drawTransferDab:(...args:unknown[])=>void}
  const draw=vi.spyOn(painter,'drawTransferDab')
  engine.appendOperation(makeStroke('peer','ink',[dab(20,30,{size:5})],{tool:'digitalBrush',preset,strokeId:'modern'}),'remote')
  expect(draw).not.toHaveBeenCalled()
  engine.appendOperation(makeStroke('peer','ink',[dab(30,30,{size:5})],{tool:'digitalBrush',preset,strokeId:'modern',strokeEnd:true}),'remote')
  expect(draw.mock.calls.filter(c=>c[7]==='lay')).toHaveLength(1)
  expect(draw.mock.calls.filter(c=>c[7]==='mask')).toHaveLength(mean?1:0)
 }finally{engine.destroy()}
})
