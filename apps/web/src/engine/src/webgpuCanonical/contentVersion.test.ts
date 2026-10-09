import {afterEach,expect,it,vi} from 'vitest'
import {CanonicalWatercolorWebGpu} from './backend'
afterEach(()=>vi.unstubAllGlobals())
function fixture(enabled=true){
 const backend=Object.create(CanonicalWatercolorWebGpu.prototype) as CanonicalWatercolorWebGpu,map=enabled?new WeakMap():null,fields=new Set<any>()
 const field=():any=>{const f={label:'cpu',width:2,height:2,format:'rgba8unorm',filter:'nearest',texture:{destroy:vi.fn()},view:{}};fields.add(f);return f}
 const encoder={beginRenderPass:vi.fn(()=>({end:()=>{}})),copyTextureToTexture:vi.fn(),copyBufferToTexture:vi.fn()}
 const queue={writeTexture:vi.fn(),writeBuffer:vi.fn(),submit:vi.fn()},device={queue,destroy:vi.fn(),createBuffer:vi.fn(()=>({destroy:vi.fn()}))}
 Object.assign(backend,{diagnosticEncodedVersions:map,ownedFields:fields,options:{},activeEncoder:null,pendingScopes:0,pendingRetired:new Set(),activeRetired:[],activeBuffers:[],retiredOwnerResources:new Set(),diagnosticTimestamps:null,device,staticPaperEpoch:0,staticNoiseEpoch:0})
 return{backend,map,field,encoder,queue}
}
it('same-field clear/copy/upload increments partial encoded revision after successful writes only',()=>{
 vi.stubGlobal('GPUBufferUsage',{COPY_SRC:1,COPY_DST:2})
 const f=fixture(),a=f.field(),b=f.field(),read=(x:any)=>f.backend.diagnosticFieldContentVersion(x)
 f.backend.encodeClearField(f.encoder as any,a);expect(read(a)).toMatchObject({enabled:true,knownEncodedWrites:1,complete:false})
 f.backend.copyField(a,b,f.encoder as any);expect(read(a).knownEncodedWrites).toBe(1);expect(read(b).knownEncodedWrites).toBe(1)
 f.backend.encodeUploadRgba(f.encoder as any,a,new Uint8Array(16));expect(read(a).knownEncodedWrites).toBe(2)
 f.backend.upload(a,new Uint8Array(16));expect(read(a).knownEncodedWrites).toBe(3);expect(f.queue.writeTexture).toHaveBeenCalledOnce()
 f.backend.copyRegion(a,b,[0,0],[0,0],[0,1],f.encoder as any);f.backend.encodeClearField(f.encoder as any,a,[0,0,0,1]);expect(read(a).knownEncodedWrites).toBe(3);expect(read(b).knownEncodedWrites).toBe(1)
})
it('failed encoding does not report successful helper write; OFF unchanged and destruction removes authority',()=>{
 const f=fixture(),a=f.field();f.encoder.beginRenderPass.mockImplementation(()=>({end:()=>{throw Error('encode failed')}}))
 expect(()=>f.backend.encodeClearField(f.encoder as any,a)).toThrow('encode failed');expect(f.backend.diagnosticFieldContentVersion(a).knownEncodedWrites).toBe(0)
 f.encoder.beginRenderPass.mockImplementation(()=>({end:()=>{}}));f.backend.encodeClearField(f.encoder as any,a)
 f.backend.destroyField(a);expect(f.map!.has(a)).toBe(false);expect(f.backend.diagnosticFieldContentVersion(a)).toMatchObject({knownEncodedWrites:null,complete:false})
 const off=fixture(false),b=off.field();off.backend.encodeClearField(off.encoder as any,b);expect(off.backend.diagnosticFieldContentVersion(b)).toMatchObject({enabled:false,knownEncodedWrites:null,complete:false});expect(off.map).toBeNull();expect(off.encoder.beginRenderPass).toHaveBeenCalledOnce();f.backend.destroy();expect(f.backend.diagnosticFieldContentVersion(a).enabled).toBe(false)
})
