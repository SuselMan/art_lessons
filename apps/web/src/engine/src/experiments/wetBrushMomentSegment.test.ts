import {it,expect} from 'vitest'
import type {Dab} from '@grafetto/shared'
import {prepareMomentSegment,type MomentContactState} from './wetBrushMomentRecipe'
import {momentGpuOracle,packMomentRecords} from './wetBrushMomentGpu'
const dab=(x:number):Dab=>({x,y:10,size:40,pressure:.8,opacity:1,tiltX:0,tiltY:0,aspectRatio:1,angle:0,t:x})
it('same retained tape split into different live packets yields identical recipes and coupled P/C',()=>{
 const dabs=[dab(10),dab(20),dab(20),dab(20),dab(30),dab(10)]
 function run(partitions:number[]){let state:MomentContactState|undefined,index=0,previous:Dab|undefined;const recipes=[];const p=new Uint8Array([0,200,100,220,0,200,100,220]),c=new Uint8Array([90,20,30,100,10,20,30,100]);let records:Uint32Array=packMomentRecords(p,c,new Uint8Array([255,255]),new Uint8Array([255,255]))
  for(const count of partitions){/* Film epochs may change HERE, no contact reset. */for(let i=0;i<count;i++){const prepared=prepareMomentSegment(state,[dabs[index++]],previous);state=prepared.state;previous=dabs[index-1];recipes.push(prepared.recipe);for(const axis of [0,1] as const)for(const parity of [0,1] as const)records=momentGpuOracle(records,{width:2,height:1,axis,parity,mixRate:prepared.recipe.mixRate,advectionRate:prepared.recipe.advectionRate,direction:axis?prepared.recipe.directionY:prepared.recipe.directionX})}}
  return{recipes,records}}
 expect(run([2,1,3])).toEqual(run([1,3,2]));expect(run([6]).recipes[3].directionX).toBe(256)
})
it('rejects arbitrary multi-dab source groups and missing retained continuity',()=>{
 expect(()=>prepareMomentSegment(undefined,[dab(1),dab(2)])).toThrow('per-dab')
 const {state}=prepareMomentSegment(undefined,[dab(10)])
 expect(()=>prepareMomentSegment(state,[dab(20)],dab(5))).toThrow('continuity')
 const fresh=prepareMomentSegment(state,[dab(200)]);expect(fresh.recipe.ordinal).toBe(0);expect(fresh.recipe.directionX).toBe(0)
})
