import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import type {DeviceType} from '../browser/deviceType'
const request=vi.hoisted(()=>vi.fn())
vi.mock('./api',()=>({api:request}))
function harness(){
 const values=new Map<string,string>(),write=vi.fn((key:string,value:string)=>{values.set(key,value)}),read=vi.fn((key:string)=>values.get(key)??null)
 const target=Object.assign(new EventTarget(),{devicePixelRatio:2,innerWidth:800,innerHeight:600})
 const loseContext=vi.fn(),parameter=vi.fn((key:number)=>key===3?4096:key===1?'vendor':'renderer')
 const gl={VENDOR:1,RENDERER:2,MAX_TEXTURE_SIZE:3,getParameter:parameter,getExtension:vi.fn((name:string)=>name==='WEBGL_lose_context'?{loseContext}:null)}
 const create=vi.fn(()=>({getContext:vi.fn(()=>gl)})),media=vi.fn(()=>({matches:false}))
 vi.stubGlobal('window',target);vi.stubGlobal('document',{createElement:create});vi.stubGlobal('localStorage',{getItem:read,setItem:write})
 vi.stubGlobal('screen',{width:1000,height:900});vi.stubGlobal('navigator',{maxTouchPoints:5,language:'ru',hardwareConcurrency:8});vi.stubGlobal('matchMedia',media)
 const down=(pointerType='pen',pressure=.5)=>target.dispatchEvent(Object.assign(new Event('pointerdown'),{pointerType,pressure}))
 return {target,values,write,read,create,media,parameter,loseContext,down}
}
beforeEach(()=>{vi.resetModules();vi.useFakeTimers();request.mockReset();request.mockResolvedValue(undefined)})
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals()})
it('keeps first-pen storage, collection, GPU and network outside capture; refreshes dynamic fields but reuses page GPU metadata',async()=>{
 const h=harness(),{reportEnvironment}=await import('./environment');let selected:DeviceType='desktop'
 const device=vi.fn(()=>selected)
 reportEnvironment(device);expect(request).toHaveBeenCalledOnce();expect(h.create).toHaveBeenCalledOnce();expect(h.loseContext).toHaveBeenCalledOnce()
 const reads=h.read.mock.calls.length,media=h.media.mock.calls.length
 h.down();h.down()
 expect(h.write).not.toHaveBeenCalled();expect(h.read).toHaveBeenCalledTimes(reads);expect(h.media).toHaveBeenCalledTimes(media)
 expect(request).toHaveBeenCalledOnce();expect(device).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(1)
 selected='tablet';h.target.innerWidth=777
 vi.runOnlyPendingTimers()
 expect(h.write).toHaveBeenCalledExactlyOnceWith('al_pen_seen','1');expect(request).toHaveBeenCalledTimes(2)
 expect(request.mock.calls[0]).toEqual(['POST /api/me/environment',{body:expect.objectContaining({penSeen:false,deviceType:'desktop'})}])
 expect(request.mock.calls[1]).toEqual(['POST /api/me/environment',{body:expect.objectContaining({penSeen:true,deviceType:'tablet',viewportW:777,gpuVendor:'vendor',gpuRenderer:'renderer',maxTextureSize:4096})}])
 expect(h.create).toHaveBeenCalledOnce();expect(h.parameter).toHaveBeenCalledTimes(3);expect(h.loseContext).toHaveBeenCalledOnce()
 h.down();expect(vi.getTimerCount()).toBe(0)
})
it('ignores non-pen/zero pressure and keeps the in-memory pen fact when private storage refuses writes',async()=>{
 const h=harness(),{reportEnvironment,collectEnvironment}=await import('./environment');reportEnvironment(()=>'desktop')
 h.down('mouse');h.down('pen',0);expect(vi.getTimerCount()).toBe(0);expect(request).toHaveBeenCalledOnce()
 h.write.mockImplementation(()=>{throw Error('private storage')});h.down();expect(h.write).not.toHaveBeenCalled()
 vi.runOnlyPendingTimers();expect(request.mock.calls[1][1].body.penSeen).toBe(true)
 expect(collectEnvironment('desktop').penSeen).toBe(true);expect(h.create).toHaveBeenCalledOnce()
})
it('contains synchronous collection/request and rejected network failures without throwing from input or deferred task',async()=>{
 const h=harness(),{reportEnvironment}=await import('./environment'),device=vi.fn<()=>DeviceType>(()=>{throw Error('settings unavailable')})
 expect(()=>reportEnvironment(device)).not.toThrow();device.mockReturnValue('tablet');request.mockImplementation(()=>{throw Error('transport unavailable')})
 expect(()=>h.down()).not.toThrow();expect(()=>vi.runOnlyPendingTimers()).not.toThrow()
 request.mockRejectedValue(Error('offline'))
 expect(()=>reportEnvironment(()=>'tablet')).not.toThrow();await Promise.resolve()
})
it('reports an already known pen immediately without installing deferred first-pen work',async()=>{
 const h=harness();h.values.set('al_pen_seen','1');const {reportEnvironment}=await import('./environment')
 reportEnvironment(()=>'tablet');h.down();expect(request).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);expect(h.write).not.toHaveBeenCalled()
})
