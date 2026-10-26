import { expect,it } from 'vitest'
import { strokeDabs,type BrushDescriptor,type StrokeOperation } from '@grafetto/shared'
import { installBrushLibrary } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { brushDraws,createTestEngine,dab,makeLayerAdd,makeStroke,paperReady,pointerSample } from './testing/engineTestUtils'
function fixture(){
 const child:BrushDescriptor={...digitalBrushFromPreset('hard-round'),flow:.37,spacing:1,scatter:undefined,tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'},sizeByPressure:[[0,1],[1,1]],behavior:{version:2,spacing:{mode:'diameter',coefficient:1}}}
 const descriptor:BrushDescriptor={...child,id:`imported-${'e'.repeat(24)}`,version:123,flow:.91,spacing:1,behavior:{version:2,spacing:{mode:'diameter',coefficient:1},dual:{brush:child,blendMode:'multiply',sampling:'independent'}}}
 installBrushLibrary({schemaVersion:1,brushes:[{name:'Authored endpoint',source:'qa',warnings:[],descriptor}],assets:[],skipped:[]})
 return `brush:${descriptor.id}@123`
}
const input=[dab(8.5,16,{size:1,pressure:1,opacity:1}),dab(9,16,{size:1,pressure:1,opacity:1})]
const endSample={...dab(10,16,{size:1,pressure:1,opacity:1}),baseSize:1}
function stamps(engine:ReturnType<typeof createTestEngine>['engine']){
 return brushDraws(engine).filter(d=>d.kind==='stamp' && d.uniforms.get('u_ceilingPass')===0).map(d=>({x:(d.uniforms.get('u_dabCenter') as number[])[0],white:(d.uniforms.get('u_color') as number[])[0]===1}))
}
it('replays endpoint-only final chunks through the same child sampler, without primary ink',()=>{
 const preset=fixture(),{engine}=createTestEngine({userId:'owner'},{width:32,height:32})
 try{
 engine.appendOperation(makeLayerAdd('peer','ink'))
 engine.appendOperation(makeStroke('peer','ink',input,{tool:'digitalBrush',preset,color:[.8,.2,.1],strokeId:'gesture'}),'remote')
 const before=stamps(engine).length
 const final=makeStroke('peer','ink',[],{tool:'digitalBrush',preset,color:[.8,.2,.1],strokeId:'gesture',strokeEnd:true,strokeEndSample:endSample})
 engine.appendOperation(final,'remote')
 const tail=stamps(engine).slice(before)
 expect(tail).toContainEqual({x:9.5,white:true})
 expect(tail.some(d=>!d.white)).toBe(false)
 }finally{engine.destroy()}
})
it('does not lose the endpoint when a peer has already streamed every primary dab',()=>{
 const preset=fixture(),{engine}=createTestEngine({userId:'observer'},{width:32,height:32})
 try{
 engine.appendOperation(makeLayerAdd('peer','ink'))
 engine.appendPeerLiveDabs('peer',{strokeId:'live',layerId:'ink',tool:'digitalBrush',preset,color:[.8,.2,.1],packetSeq:0,dabs:input})
 const before=stamps(engine).length
 engine.endPeerLiveStroke('peer','live')
 engine.appendOperation(makeStroke('peer','ink',input,{tool:'digitalBrush',preset,color:[.8,.2,.1],strokeId:'live',strokeEnd:true,strokeEndSample:endSample}),'remote')
 const tail=stamps(engine).slice(before)
 expect(tail).toContainEqual({x:9.5,white:true});expect(tail.some(d=>!d.white)).toBe(false)
 }finally{engine.destroy()}
})
it('records a metadata-only pen-up after an exact chunk flush, retaining canonical input',async()=>{
 const preset=fixture(),{engine}=createTestEngine({userId:'owner'},{width:32,height:32})
 try{
 await paperReady(engine);engine.initLayer('ink');engine.setActiveLayer('ink');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(1)
 engine['_onStart'](pointerSample(8.5,16,{pressure:1,timeStamp:0}))
 engine['_flushStrokeChunk']()
 engine['_onEnd'](pointerSample(8.5,16,{pressure:0,timeStamp:20}))
 const ops=engine['_log'].entries.map(e=>e.op).filter((op):op is StrokeOperation=>op.type==='stroke')
 expect(ops).toHaveLength(2)
 expect(ops[1].strokeEnd).toBe(true);expect(strokeDabs(ops[1])).toEqual([])
 expect(ops[1].strokeEndSample).toMatchObject({x:8.5,y:16,pressure:1,baseSize:1})
 }finally{engine.destroy()}
})
it('retains the child tail through full replay and undo/redo of the gesture',()=>{
 const preset=fixture(),{engine}=createTestEngine({userId:'observer'},{width:32,height:32})
 try{
 engine.appendOperation(makeLayerAdd('peer','ink'))
 const prefix=makeStroke('peer','ink',input,{tool:'digitalBrush',preset,color:[.8,.2,.1],strokeId:'undo-endpoint'})
 const final=makeStroke('peer','ink',[],{tool:'digitalBrush',preset,color:[.8,.2,.1],strokeId:'undo-endpoint',strokeEnd:true,strokeEndSample:endSample})
 engine.appendOperation(prefix,'remote');engine.appendOperation(final,'remote')
 let before=stamps(engine).length
 engine.bakeLayerByFullReplay('ink')
 expect(stamps(engine).slice(before)).toContainEqual({x:9.5,white:true})
 engine.appendOperation({id:'endpoint-undo',type:'operation_undo',userId:'peer',timestamp:30,targetOpId:prefix.id},'remote')
 before=stamps(engine).length
 engine.appendOperation({id:'endpoint-redo',type:'operation_redo',userId:'peer',timestamp:31,targetOpId:prefix.id},'remote')
 expect(stamps(engine).slice(before)).toContainEqual({x:9.5,white:true})
 }finally{engine.destroy()}
})
