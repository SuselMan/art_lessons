import {it,expect} from 'vitest'
import {watercolorQaOptions as options} from './watercolorQaOptions'
it('requires native, defaults OFF, validates unique DEV flags, ignores all flags in production',()=>{
 expect(()=>options(true,undefined,undefined,'?wcAsyncObservedFields=1')).toThrow(/requires wcNative/)
 expect(options(true,undefined,undefined,'?wcNative=1').diagnosticAsyncObservedFields).toBe(false)
 expect(options(true,undefined,undefined,'?wcNative=1&wcAsyncObservedFields=1').diagnosticAsyncObservedFields).toBe(true)
 for(const q of ['?wcAsyncObservedFields=yes','?wcAsyncObservedFields=1&wcAsyncObservedFields=0','?wcAsyncObservedFields=1&wcAsyncObservedFields=1'])expect(()=>options(true,undefined,undefined,q)).toThrow(/Invalid/)
 expect(options(false,undefined,undefined,'?wcAsyncObservedFields=yes&wcAsyncObservedFields=1').diagnosticAsyncObservedFields).toBe(false)
})
