import{it,expect}from'vitest'
import{installNativeTipA,specializeNativeTipA}from './nativeTipContactQa'
import{CANONICAL_STAMP_WGSL}from '../webgpuCanonical/stamp'
import{CANONICAL_RIBBON_WGSL}from '../webgpuCanonical/deposit'
it('OFF and production preserve original device identity without compiler substitution',()=>{const device={}as GPUDevice,backend={device};expect(installNativeTipA(backend,false,true).enabled).toBe(false);expect(backend.device).toBe(device);expect(installNativeTipA(backend,true,false).enabled).toBe(false);expect(backend.device).toBe(device)})
it('A changes only shared contact endpoint in both literal source programs',()=>{for(const s of [CANONICAL_STAMP_WGSL,CANONICAL_RIBBON_WGSL])expect(specializeNativeTipA(s)).toBe(s.replace('mix(mix(0.34, 0.39, light), 0.62, release)','mix(mix(0.28, 0.39, light), 0.62, release)'))})
it('unsupported/eager owners reject before shader mutation',()=>{expect(()=>installNativeTipA({device:{}as GPUDevice},true,true)).toThrow('lazy');expect(()=>installNativeTipA({device:{}as GPUDevice,options:{roomOwnedResources:true},_stamps:{}}as never,true,true)).toThrow('lazy')})
it('context-owned compiler substitution covers stamp/ribbon only and preserves underlying receiver',async()=>{
 const codes:string[]=[],device={createShaderModule(this:unknown,d:GPUShaderModuleDescriptor){expect(this).toBe(device);codes.push(d.code);return{}},createBuffer(this:unknown){expect(this).toBe(device);return'same-buffer'}}
 const backend={device:device as unknown as GPUDevice,options:{roomOwnedResources:true}},proof=installNativeTipA(backend,true,true)
 backend.device.createShaderModule({code:CANONICAL_STAMP_WGSL});backend.device.createShaderModule({code:CANONICAL_RIBBON_WGSL});backend.device.createShaderModule({code:'unrelated'})
 expect(codes).toEqual([specializeNativeTipA(CANONICAL_STAMP_WGSL),specializeNativeTipA(CANONICAL_RIBBON_WGSL),'unrelated']);expect(proof.modules.map(m=>m.family)).toEqual(['stamp','ribbon']);expect(device.createShaderModule).not.toBe(backend.device.createShaderModule);expect(backend.device.createBuffer({size:1,usage:1})).toBe('same-buffer')
 for(let i=0;i<20&&!proof.modules.every(m=>m.patchedSha);i++)await new Promise(r=>setTimeout(r,5))
 expect(proof.modules.every(m=>m.baselineSha&&m.patchedSha&&m.baselineSha!==m.patchedSha)).toBe(true)
})
