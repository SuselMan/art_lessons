import {expect,it,vi} from 'vitest'
import type {LayerState,Operation,StrokeOperation} from '@grafetto/shared'
import {createTestEngine,makeLayerAdd,makeStroke,dab,paperReady} from '../../../engine/testing/engineTestUtils'
import type {PuddleRoomController} from '../../../engine/src/watercolor/puddle/PuddleRoomController'
import type {ILayerBuffer} from '../../../engine/src/buffers/ILayerBuffer'
import {isRecoverableContentOp,recoveryOperations} from './lostWork'
vi.mock('../../../engine/src/watercolor/puddle/PuddleTarget',()=>({createNativePuddleTarget:()=>({state:{done:true},resetFromScratch(){},step(){},dry(){},cancel(){},destroy(){},buffers:()=>({p:{},c:{},coverage:{}})})}))
vi.mock('../../../engine/src/watercolor/puddle/PuddlePresentation',()=>({createPuddlePresentation:()=>({invalidate(){},destroy(){},reset(){},setTarget(){},acceptInput(){},tick:()=>({copyTo(){}})})}))
const empty:LayerState={items:{},rootOrder:[],activeId:'',selectedIds:[]}
const capture=(engine:ReturnType<typeof createTestEngine>['engine'],id:string)=>{const s=engine as unknown as {_puddle:PuddleRoomController;_layers:Map<string,ILayerBuffer>};return s._puddle.capture(s._layers.get(id)!)!}
for(const boundary of ['explicit-dry','natural-gap'] as const)it(`recovery preserves the original M70 ${boundary} material boundary`,async()=>{
 const accepted=createTestEngine({userId:'observer',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32}).engine
 const recovered=createTestEngine({userId:'observer',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32}).engine
 await paperReady(accepted);await paperReady(recovered)
 const wet=(id:string,x:number,timestamp:number):StrokeOperation=>makeStroke('A','dead',[dab(x,x,{size:6,opacity:1})],{id,tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',strokeId:id,washId:'m70:dead',timestamp})
 const originals:Operation[]=[wet('wet-a',5,100),...(boundary==='explicit-dry'?[{id:'original-dry',type:'paper_dry' as const,userId:'A',layerId:'dead',timestamp:200}]:[]),wet('wet-b',25,boundary==='natural-gap'?120200:300)]
 let id=0
 const plan=recoveryOperations({lost:originals.filter(isRecoverableContentOp),live:empty,log:[],restored:null,userId:'A',unnamedLayer:'lost',restoredName:name=>name,newId:()=>`new-${++id}`,now:()=>1000000})
 try{
  accepted.suspendDisplay();recovered.suspendDisplay()
  accepted.appendOperation({...makeLayerAdd('A','dead'),seq:1},'remote')
  for(const [index,op]of originals.entries())accepted.appendOperation({...op,seq:index+2},'remote')
  for(const [index,op]of plan.operations.entries())recovered.appendOperation({...op,seq:index+1},'remote')
  accepted.resumeDisplay();recovered.resumeDisplay()
  const actual=capture(recovered,plan.restoredLayerIds[0]),expected=capture(accepted,'dead')
  expect(actual).not.toBeNull();expect(expected).not.toBeNull()
  expect(actual.storageBounds).toEqual(expected.storageBounds)
  expect(actual.waterUsed).toBe(expected.waterUsed)
  expect(actual.pigmentUsed).toBe(expected.pigmentUsed)
  expect(actual.tiles.map(tile=>Object.values(tile.bufs).map(buf=>buf?Array.from(buf.pixels):null))).toEqual(expected.tiles.map(tile=>Object.values(tile.bufs).map(buf=>buf?Array.from(buf.pixels):null)))
 }finally{accepted.destroy();recovered.destroy()}
})
it('scoped Dry is context without creating a recovery layer on its own; global Dry is not retargeted',()=>{
 const dry:Operation={id:'only-dry',type:'paper_dry',userId:'A',layerId:'dead',timestamp:100}
 expect(isRecoverableContentOp(dry)).toBe(true)
 expect(isRecoverableContentOp({...dry,layerId:undefined})).toBe(false)
 const id=vi.fn(()=> 'unexpected')
 const plan=recoveryOperations({lost:([dry] as Operation[]).filter(isRecoverableContentOp),live:empty,log:[],restored:null,userId:'A',unnamedLayer:'lost',restoredName:name=>name,newId:id,now:()=>1000})
 expect(plan.operations).toEqual([]);expect(plan.restoredLayerIds).toEqual([]);expect(id).not.toHaveBeenCalled()
})
it('M70 recovery keeps material timestamps and scoped Dry, while a separate legacy group keeps restamping',()=>{
 const a=makeStroke('A','dead',[dab(5,5)],{id:'a',tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',timestamp:100})
 const dry:Operation={id:'d',type:'paper_dry',userId:'A',layerId:'dead',timestamp:200}
 const legacy=makeStroke('A','legacy',[dab(5,5)],{id:'legacy',timestamp:50})
 let id=0
 const plan=recoveryOperations({lost:([a,dry,legacy] as Operation[]).filter(isRecoverableContentOp),live:empty,log:[],restored:null,userId:'A',unnamedLayer:'lost',restoredName:name=>name,newId:()=>`id-${++id}`,now:()=>1000})
 expect(plan.operations.filter(op=>op.type!=='layer_add').map(op=>[op.type,op.timestamp])).toEqual([['stroke',100],['paper_dry',200],['stroke',1000]])
 expect(plan.operations.every(op=>!['a','d','legacy'].includes(op.id))).toBe(true)
 expect(plan.operations.filter(op=>op.type==='paper_dry').map(op=>op.layerId)).toEqual([plan.restoredLayerIds[0]])
})
