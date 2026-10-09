import {it,expect,vi} from 'vitest'
import {CanonicalWatercolorWebGpu} from './backend'
it('window only selects existing encoder wrapping, without GPU calls or source/order changes',()=>{
 const backend=Object.create(CanonicalWatercolorWebGpu.prototype) as CanonicalWatercolorWebGpu,begin=vi.fn(()=>({encoder:'wrapped'})),device={queue:{submit:vi.fn()},createQuerySet:vi.fn()}
 Object.assign(backend,{device,diagnosticTimestamps:{begin},diagnosticTimestampWindow:true})
 const encoder={} as GPUCommandEncoder
 expect(backend.diagnosticTimestampQuantum(encoder)).toEqual({encoder:'wrapped'})
 backend.setDiagnosticTimestampWindow(false);expect(backend.diagnosticTimestampQuantum(encoder)).toBeNull();backend.setDiagnosticTimestampWindow(true);backend.diagnosticTimestampQuantum(encoder)
 expect(begin).toHaveBeenCalledTimes(2);expect(begin).toHaveBeenCalledWith(encoder);expect(device.queue.submit).not.toHaveBeenCalled();expect(device.createQuerySet).not.toHaveBeenCalled()
 expect(()=>backend.setDiagnosticTimestampWindow(1 as unknown as boolean)).toThrow();Object.assign(backend,{diagnosticTimestamps:null});expect(()=>backend.setDiagnosticTimestampWindow(true)).toThrow()
})
