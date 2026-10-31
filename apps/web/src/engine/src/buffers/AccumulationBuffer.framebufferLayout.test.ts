import {afterEach,expect,it,vi} from 'vitest'
import {MockGL} from '../../testing/mockGL'
import {AccumulationBuffer} from './AccumulationBuffer'
import {snapshotContextStorage} from './ContextStorageOwner'
afterEach(()=>vi.restoreAllMocks())
function setup(){const mock=new MockGL();return {mock,gl:mock as unknown as WebGLRenderingContext}}
it('checks every straight allocation once cold even after a successful legacy allocation in the same context',()=>{
 const {mock,gl}=setup(),status=vi.spyOn(mock,'checkFramebufferStatus'),attachment=vi.spyOn(mock,'getFramebufferAttachmentParameter')
 const legacy=new AccumulationBuffer(gl,4,4),a=new AccumulationBuffer(gl,4,4,'nearest','straight-rgba8'),b=new AccumulationBuffer(gl,8,4,'nearest','straight-rgba8')
 expect(status).toHaveBeenCalledTimes(3);expect(attachment).toHaveBeenCalledTimes(2)
 const layout=a.verifiedFramebufferLayout
 expect(layout).toEqual({gl,texture:a.texture,framebuffer:a.fbo,width:4,height:4});expect(Object.isFrozen(layout)).toBe(true)
 expect(a.verifiedFramebufferLayout).toBe(layout);expect(b.verifiedFramebufferLayout).not.toBe(layout);expect(legacy.verifiedFramebufferLayout).toBeUndefined()
 expect(status).toHaveBeenCalledTimes(3);expect(attachment).toHaveBeenCalledTimes(2)
 legacy.destroy();a.destroy();b.destroy()
})
it.each(['status','attachment','attachment-throw'] as const)('rejects and retires an unverified straight allocation on %s failure',failure=>{
 const {mock,gl}=setup(),legacy=new AccumulationBuffer(gl,4,4),before=snapshotContextStorage(gl).residentBytes
 const textures=vi.spyOn(mock,'deleteTexture'),fbos=vi.spyOn(mock,'deleteFramebuffer')
 if(failure==='status')vi.spyOn(mock,'checkFramebufferStatus').mockReturnValueOnce(-1)
 else if(failure==='attachment')vi.spyOn(mock,'getFramebufferAttachmentParameter').mockReturnValueOnce({})
 else vi.spyOn(mock,'getFramebufferAttachmentParameter').mockImplementationOnce(()=>{throw new Error('attachment query failed')})
 expect(()=>new AccumulationBuffer(gl,4,4,'nearest','straight-rgba8')).toThrow()
 expect(textures).toHaveBeenCalledOnce();expect(fbos).toHaveBeenCalledOnce();expect(snapshotContextStorage(gl).residentBytes).toBe(before)
 const next=new AccumulationBuffer(gl,4,4,'nearest','straight-rgba8');expect(next.verifiedFramebufferLayout).toBeDefined();next.destroy();legacy.destroy()
})
it('revokes metadata after handle drift, destruction or a forgotten storage generation without GL queries',()=>{
 const {mock,gl}=setup(),a=new AccumulationBuffer(gl,4,4,'nearest','straight-rgba8'),texture=a.texture
 const status=vi.spyOn(mock,'checkFramebufferStatus'),attachment=vi.spyOn(mock,'getFramebufferAttachmentParameter');status.mockClear();attachment.mockClear()
 a._texture={} as WebGLTexture;expect(a.verifiedFramebufferLayout).toBeUndefined();a._texture=texture
 expect(a.verifiedFramebufferLayout).toBeDefined();a.destroy();expect(a.verifiedFramebufferLayout).toBeUndefined()
 const b=new AccumulationBuffer(gl,4,4,'nearest','straight-rgba8');status.mockClear();attachment.mockClear()
 AccumulationBuffer.forgetContextStorage(gl);expect(b.verifiedFramebufferLayout).toBeUndefined();expect(b.storageOwnerCurrent).toBe(false)
 expect(status).not.toHaveBeenCalled();expect(attachment).not.toHaveBeenCalled();b.destroy()
})
