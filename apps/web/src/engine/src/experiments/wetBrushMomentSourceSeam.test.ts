import {describe,it,expect} from 'vitest'
import {WetBrushMomentSourceSeam} from './wetBrushMomentSourceSeam'
import type {CanonicalWatercolorWebGpu} from '../webgpuCanonical/backend'
describe('DEV ordinary source integration safety',()=>{
 it('OFF does not inspect source ownership or allocate/encode anything',()=>{const device=new Proxy({},{get(){throw Error('GPU access')}}) as GPUDevice;const backend={device} as CanonicalWatercolorWebGpu;const seam=new WetBrushMomentSourceSeam(backend);const result=seam.encodeAfterLanding(null as never,null as never,false);expect(result.buffers).toEqual([]);expect(result.invalid).toBe(null);expect(()=>result.release()).not.toThrow()})
 it('rejects non-current film before touching source or pool leases',()=>{const backend={device:{}} as CanonicalWatercolorWebGpu;const tile={owner:backend,height:1024},e={inkLoad:{},inkColor:{},filmGesture:3};const scratch={peek:()=>e,pool:new Proxy({},{get(){throw Error('Lease accessed')}})};const seam=new WetBrushMomentSourceSeam(backend);expect(()=>seam.encodeAfterLanding(null as never,{scratch,tile,segment:{rect:[0,0,400,400],film:true},availableWater:{owner:backend},materialGesture:4,recipe:{}} as never,true)).toThrow('initialized current film')})
})
