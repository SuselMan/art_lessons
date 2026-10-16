import {expect,it} from 'vitest'
import type {Operation} from '@grafetto/shared'
import {exactMaterialHistory} from './exactMaterialHistory'
const a={id:'A',type:'stroke',userId:'A',layerId:'L',timestamp:1,tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',color:[0,0,1],dabs:[]} as Operation
it('requires the whole resulting material history, rejecting foreign Dry despite an unchanged prefix',()=>{
 let current:Operation[]=[a]
 const valid=exactMaterialHistory(current,()=>current)
 expect(valid()).toBe(true)
 current=[a,{id:'dry',type:'paper_dry',userId:'B',layerId:'L',timestamp:2}]
 expect(valid()).toBe(false)
 current=[a,{id:'undo',type:'operation_undo',userId:'A',targetOpId:'removed-gesture',timestamp:3}]
 expect(valid()).toBe(true)
})
it('rejects zero pigment under the same operation ID, foreign activity and optimistic reordering',()=>{
 let current:Operation[]=[a]
 const valid=exactMaterialHistory(current,()=>current)
 current=[{...a,preset:'normal:80:0:PB29:round:wc@m70-r2-v1'} as Operation]
 expect(valid()).toBe(false)
 const b={...a,id:'B',userId:'B',layerId:'other'} as Operation
 current=[a,b];expect(valid()).toBe(false)
 current=[b,a];expect(valid()).toBe(false)
 current=[{...a}];expect(valid()).toBe(false) // Conservative confirmation fallback.
})
