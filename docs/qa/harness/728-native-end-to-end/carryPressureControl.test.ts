import {it,expect} from 'vitest'
import {installCarryPressureControl} from './carryPressureControl'
const nearest={field:{filter:'nearest'}},pressure={field:{filter:'linear'}}
it('changes only original carry pressure hardware sampling, restores flag on throw',()=>{
 const seen:any[]=[],adapter:any={diagnosticHardwareLinearInputs:false,diagnosticPairedCarry:false,fieldOp(...a:any[]){seen.push([a[3],this.diagnosticHardwareLinearInputs]);if(a[4]===-1)throw Error('encodefail')}},old=adapter.fieldOp,c=installCarryPressureControl(adapter,true)
 adapter.fieldOp({},nearest,nearest,15,1,{d:pressure});adapter.fieldOp({},nearest,nearest,16,1,{d:pressure,c:nearest});adapter.fieldOp({},nearest,nearest,6,1,{d:pressure})
 expect(seen).toEqual([[15,true],[16,true],[6,false]])
 expect(()=>adapter.fieldOp({},nearest,nearest,15,-1,{d:pressure})).toThrow('encodefail');expect(adapter.diagnosticHardwareLinearInputs).toBe(false)
 expect(()=>adapter.fieldOp({},nearest,nearest,15,1,{d:pressure,e:pressure})).toThrow('ONLY LINEAR')
 c.detach();expect(adapter.fieldOp).toBe(old)
})
it('OFF preserves default and refuses ambiguous global/paired controls before calls',()=>{
 const a:any={diagnosticHardwareLinearInputs:false,fieldOp(){return 42}},c=installCarryPressureControl(a)
 expect(a.fieldOp({},nearest,nearest,15,1,{})).toBe(42);expect(a.diagnosticHardwareLinearInputs).toBe(false);c.detach()
 expect(()=>installCarryPressureControl({...a,diagnosticHardwareLinearInputs:true},true)).toThrow('baseline')
 expect(()=>installCarryPressureControl({...a,diagnosticPairedCarry:true},true)).toThrow('baseline')
})
