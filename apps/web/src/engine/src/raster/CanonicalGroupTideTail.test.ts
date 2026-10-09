import {expect,it} from 'vitest'
import {CanonicalWatercolorSettlePlan} from './CanonicalWatercolorSettlePlan'
import type {CanonicalSettlePlanContext,SettlePlanBuffer,SettlePlanField} from '../watercolor/SettlePlanContracts'
class Buffer implements SettlePlanBuffer<Buffer>{width=1536;height=1536;clear(){}copyTo(){}copyRegionInto(){}destroy(){}}
it('original 400px group-dry tail has exactly seed + 3 inward + rim + tide + colour quanta',()=>{
 const calls:string[][]=[];let current:string[]=[]
 const ctx={passes:()=>({fieldOp:(_out:Buffer,_a:Buffer,_b:Buffer,mode:number)=>current.push('fieldOp'+mode),waterFrontStep:(_field:unknown,_x:number,_y:number,_dry:number,_src:Buffer,_dst:Buffer,_cost:number,climb:number)=>current.push('front:'+climb)})} as unknown as CanonicalSettlePlanContext<Buffer,unknown>
 const planner=new CanonicalWatercolorSettlePlan(ctx),buffer=()=>new Buffer()
 const field={w:1536,h:1536,a:buffer(),b:buffer(),c:buffer(),ca:buffer(),cb:buffer(),cc:buffer(),coverage:buffer(),mask:buffer(),pressure:buffer(),band:buffer()} satisfies SettlePlanField<Buffer>
 const ops:Array<()=>void>=[]
 planner.groupTideOps(ops,field,0,0,200,1,new Set(),buffer(),null,buffer(),buffer(),[buffer(),buffer(),buffer()],1,false,false)
 for(const op of ops){current=[];op();calls.push(current)}
 expect(calls).toEqual([
 ['fieldOp19','fieldOp19'],
 ['front:0','front:0','front:15','front:15'],
 ['front:15','front:15','front:15','front:15'],
 ['front:15','front:15','front:15','front:15'],
 ['fieldOp6',...Array(6).fill('fieldOp5'),'fieldOp1'],
 ['fieldOp7',...Array(6).fill('fieldOp5'),'fieldOp1','fieldOp14'],
 ['fieldOp2']])
 // Actual executor has one quantum per op, then finish and dispose. Thus
 // tail numbering can be reconstructed backwards without cross-run GPU timing.
 const lastDispose=343,finish=lastDispose-1,lastOp=finish-1
 expect(calls.map((roles,i)=>({scope:lastOp-calls.length+1+i,roles})).slice(1).map(row=>row.scope)).toEqual([336,337,338,339,340,341])
 expect(finish).toBe(342)
})
