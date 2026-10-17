import {expect,it} from 'vitest'
import type {LayerState,Operation,StrokeOperation} from '@grafetto/shared'
import {createLostWorkBatcher,isRecoverableContentOp,recoveryOperations} from './lostWork'
const empty:LayerState={items:{},rootOrder:[],activeId:'',selectedIds:[]}
const wet=(id:string,timestamp:number):StrokeOperation=>({id,type:'stroke',userId:'A',layerId:'dead',tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',color:[0,0,1],dabs:[],timestamp})
// Known OPEN #778: per-batch recovery cannot preserve one dead target's
// chronological material ownership across separate debounce flushes.
it.fails('OPEN #778: A then a later Dry/B batch should retain one recovered material layer',()=>{
 let now=0,id=0,timer:(()=>void)|undefined
 const plans:ReturnType<typeof recoveryOperations>[]=[]
 const batch=createLostWorkBatcher({quietMs:800,maxWaitMs:5000,now:()=>now,timers:{set:fn=>{timer=fn;return 1},clear:()=>{timer=undefined}},onFlush:lost=>{plans.push(recoveryOperations({lost,live:empty,log:[],restored:null,userId:'A',unnamedLayer:'lost',restoredName:name=>name,newId:()=>`new-${++id}`,now:()=>now}))}})
 const a=wet('a',100),b=wet('b',1000),dry:Operation={id:'dry',type:'paper_dry',userId:'A',layerId:'dead',timestamp:900}
 batch.add(a);now=800;timer!()
 now=1801
 for(const op of ([dry,b] as Operation[]).filter(isRecoverableContentOp))batch.add(op)
 now=2601;timer!()
 expect(plans).toHaveLength(2)
 expect(plans[0].operations.map(op=>op.type)).toEqual(['layer_add','stroke'])
 expect(plans[1].operations.map(op=>op.type)).toEqual(['layer_add','paper_dry','stroke'])
 expect(plans[0].restoredLayerIds[0]).not.toBe(plans[1].restoredLayerIds[0])
 // Dry now addresses the new second layer; it cannot dry A on the first.
 expect(plans[1].operations.find(op=>op.type==='paper_dry')?.layerId).toBe(plans[1].restoredLayerIds[0])
 const sourceTargets=plans.flatMap(plan=>plan.restoredLayerIds)
 expect(new Set(sourceTargets).size).toBe(1)
})
