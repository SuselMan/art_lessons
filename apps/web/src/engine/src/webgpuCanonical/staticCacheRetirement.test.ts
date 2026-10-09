import {expect,it,vi} from 'vitest'
import {CanonicalWatercolorWebGpu} from './backend'
import {disposeNativeMaterialResources} from './roomWatercolorExecutor'
function ownerFixture(){
 const owner=Object.create(CanonicalWatercolorWebGpu.prototype)
 Object.assign(owner,{activeEncoder:null,pendingScopes:0,activeBuffers:[],activeRetired:[],pendingRetired:new Set(),retiredOwnerResources:new Set(),retirementCleanupFailures:0,staticPaperEpoch:0,staticNoiseEpoch:0,paper:{field:{texture:{}}},noise:{texture:{}}})
 return owner
}
it('uses original last scope release, not an extra queue promise, and releases once',()=>{
 const owner=ownerFixture(),cleanup=vi.fn(),one=owner.encodeOwnerCommands({},()=>1),two=owner.encodeOwnerCommands({},()=>2)
 owner.retireAfterOwnerScopes(cleanup);expect(cleanup).not.toHaveBeenCalled();one.release();expect(cleanup).not.toHaveBeenCalled();two.release();expect(cleanup).toHaveBeenCalledOnce();two.release();expect(cleanup).toHaveBeenCalledOnce()
})
it('retirement during active encoder waits for that original submission scope',()=>{
 const owner=ownerFixture(),cleanup=vi.fn(),scope=owner.encodeOwnerCommands({},()=>{owner.retireAfterOwnerScopes(cleanup);expect(cleanup).not.toHaveBeenCalled()})
 expect(cleanup).not.toHaveBeenCalled();scope.release();expect(cleanup).toHaveBeenCalledOnce()
})
it('discarded unsubmitted encoding frees cache and preserves the original rejection',()=>{
 const owner=ownerFixture(),cleanup=vi.fn(),error=Error('original encoding failure')
 expect(()=>owner.encodeOwnerCommands({},()=>{owner.retireAfterOwnerScopes(cleanup);throw error})).toThrow(error);expect(cleanup).toHaveBeenCalledOnce()
})
it('encoding failure does not free a cache still referenced by earlier submissions',()=>{
 const owner=ownerFixture(),cleanup=vi.fn(),earlier=owner.encodeOwnerCommands({},()=>0)
 expect(()=>owner.encodeOwnerCommands({},()=>{owner.retireAfterOwnerScopes(cleanup);throw Error('failed')})).toThrow('failed');expect(cleanup).not.toHaveBeenCalled();earlier.release();expect(cleanup).toHaveBeenCalledOnce()
})
it('static read-set epoch changes only for actual static input writes, not layer contacts',()=>{
 const owner=ownerFixture();expect(owner.staticInputEpoch).toBe('0:0');owner.noteStaticWrite({texture:{}});expect(owner.staticInputEpoch).toBe('0:0');owner.noteStaticWrite(owner.paper.field);expect(owner.staticInputEpoch).toBe('1:0');owner.noteStaticWrite(owner.noise);expect(owner.staticInputEpoch).toBe('1:1')
})

it('failed cleanup attempts remaining retirements and keeps original encode error',()=>{const owner=ownerFixture(),next=vi.fn(),original=Error('original');expect(()=>owner.encodeOwnerCommands({},()=>{owner.retireAfterOwnerScopes(()=>{throw Error('cleanup')});owner.retireAfterOwnerScopes(next);throw original})).toThrow(original);expect(next).toHaveBeenCalledOnce();expect(owner.retiredOwnerResources.size).toBe(0)})

it('deferred cache cleanup failure cannot reject original ACK release',()=>{const owner=ownerFixture(),scope=owner.encodeOwnerCommands({},()=>0),next=vi.fn();owner.retireAfterOwnerScopes(()=>{throw Error('destroy failed')});owner.retireAfterOwnerScopes(next);expect(()=>scope.release()).not.toThrow();expect(next).toHaveBeenCalledOnce();expect(owner.diagnosticRetirementCleanupFailures).toBe(1);scope.release();expect(next).toHaveBeenCalledOnce()})
it('device destroy frees deferred resources without ACK and repeated cleanup is idempotent',()=>{const owner=ownerFixture(),cleanup=vi.fn();Object.assign(owner,{ownedFields:new Set(),device:{destroy:vi.fn()},destroyed:false});owner.encodeOwnerCommands({},()=>0);owner.retireAfterOwnerScopes(cleanup);owner.destroy();expect(cleanup).toHaveBeenCalledOnce();owner.destroy();expect(cleanup).toHaveBeenCalledOnce();expect(owner.device.destroy).toHaveBeenCalledOnce()})

it('failed material dispose quantum always retires the cached resources',()=>{const retire=vi.fn(),error=Error('dispose failure');expect(()=>disposeNativeMaterialResources({runQuantum:vi.fn(()=>{throw error}),retireStaticFrontCache:retire},()=>{})).toThrow(error);expect(retire).toHaveBeenCalledOnce()})
