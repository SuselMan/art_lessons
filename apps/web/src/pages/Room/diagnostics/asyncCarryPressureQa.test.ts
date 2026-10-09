import {describe,it,expect} from 'vitest'
import {watercolorQaOptions} from './watercolorQaOptions'
describe('OFF async carry pressure QA dependency',()=>{
 it('requires actual native and hardware pressure flags',()=>{expect(()=>watercolorQaOptions(true,undefined,undefined,'?wcAsyncCarryPressure=1')).toThrow(/requires/);expect(()=>watercolorQaOptions(true,undefined,undefined,'?wcNative=1&wcAsyncCarryPressure=1')).toThrow(/requires/)})
 it('accepts exact native pressure tuple and stays OFF by default',()=>{expect(watercolorQaOptions(true,undefined,undefined,'?wcNative=1&wcCarryHardwarePressure=1&wcAsyncCarryPressure=1').diagnosticAsyncCarryPressure).toBe(true);expect(watercolorQaOptions(true,undefined,undefined,'?wcNative=1&wcCarryHardwarePressure=1').diagnosticAsyncCarryPressure).toBe(false)})
 it('rejects invalid and duplicated selections',()=>{expect(()=>watercolorQaOptions(true,undefined,undefined,'?wcAsyncCarryPressure=yes')).toThrow(/Invalid/);expect(()=>watercolorQaOptions(true,undefined,undefined,'?wcAsyncCarryPressure=0&wcAsyncCarryPressure=1')).toThrow(/Invalid/)})
 it('production ignores all DEV pressure compile requests',()=>{expect(watercolorQaOptions(false,undefined,undefined,'?wcAsyncCarryPressure=invalid&wcNative=1&wcCarryHardwarePressure=1').diagnosticAsyncCarryPressure).toBe(false)})
})
