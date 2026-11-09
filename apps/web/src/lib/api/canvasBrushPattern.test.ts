import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {webcrypto} from 'node:crypto'
import {resetBoardState,resetRoomStore,useRoomStore} from '../../stores/roomStore'
import {en} from '../../i18n/core/en'
import {ru} from '../../i18n/core/ru'
import {CanvasPatternError,clearCanvasBrushPattern,selectCanvasBrushPattern} from './canvasBrushPattern'

const api=vi.hoisted(()=>({publish:vi.fn(),load:vi.fn(),prepare:vi.fn(),room:'A'}))
vi.mock('./brushLibrary',()=>({currentBrushRoom:()=>api.room,publishBrushPresets:api.publish,loadBrushLibrary:api.load,prepareBrushPresets:api.prepare}))
function png():File{
 const bytes=new Uint8Array(24),header=new DataView(bytes.buffer)
 header.setUint32(0,0x89504e47);header.setUint32(4,0x0d0a1a0a);header.setUint32(12,0x49484452);header.setUint32(16,1);header.setUint32(20,1)
 return new File([bytes],'own.png',{type:'image/png'})
}
beforeEach(()=>{
 resetRoomStore();api.room='A';api.publish.mockReset().mockResolvedValue(undefined);api.load.mockReset().mockResolvedValue(undefined);api.prepare.mockReset().mockReturnValue(null)
 vi.stubGlobal('crypto',webcrypto)
 vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:1,height:1,close:vi.fn()})))
 vi.stubGlobal('document',{createElement:()=>({getContext:()=>({drawImage:vi.fn(),getImageData:()=>({data:new Uint8ClampedArray([10,20,30,128])})})})})
})
afterEach(()=>vi.unstubAllGlobals())
it('publishes real four-plane hashes then reflects immutable selection in the one roomStore; clear/reset remove it',async()=>{
 await selectCanvasBrushPattern(png())
 const selected=useRoomStore.getState().canvasPatternSelection
 expect(selected.room).toBe('A');expect(selected.name).toBe('own.png');expect(selected.pattern.kind).toBe('rgba');expect(Object.isFrozen(selected.pattern)).toBe(true)
 expect(api.publish).toHaveBeenCalledOnce();expect(api.load).toHaveBeenCalledOnce();expect(api.prepare).toHaveBeenCalledOnce()
 clearCanvasBrushPattern();expect(useRoomStore.getState().canvasPatternSelection.pattern.kind).toBe('none')
 useRoomStore.getState().setCanvasPatternSelection(selected);resetBoardState();expect(useRoomStore.getState().canvasPatternSelection.pattern.kind).toBe('none')
 useRoomStore.getState().setCanvasPatternSelection(selected);resetRoomStore();expect(useRoomStore.getState().canvasPatternSelection.name).toBe('')
})
it.each(['room','board'] as const)('cancels an A→A lifecycle reset while PNG header is pending (%s), before publication',async reset=>{
 const file=png();let release!:(value:ArrayBuffer)=>void
 const bytes=await file.arrayBuffer();vi.spyOn(file,'slice').mockReturnValue({arrayBuffer:()=>new Promise<ArrayBuffer>(resolve=>{release=resolve})} as Blob)
 const pending=selectCanvasBrushPattern(file)
 if(reset==='room')resetRoomStore();else resetBoardState()
 release(bytes);await pending
 expect(api.publish).not.toHaveBeenCalled();expect(createImageBitmap).not.toHaveBeenCalled();expect(useRoomStore.getState().canvasPatternSelection.pattern.kind).toBe('none')
})
it('does not prepare or select stale A assets when same-room lifecycle resets during library reload',async()=>{
 let release!:()=>void;api.load.mockImplementation(()=>new Promise<void>(resolve=>{release=resolve}))
 const pending=selectCanvasBrushPattern(png())
 await vi.waitFor(()=>expect(api.load).toHaveBeenCalledOnce());resetRoomStore();release();await pending
 expect(api.prepare).not.toHaveBeenCalled();expect(useRoomStore.getState().canvasPatternSelection.name).toBe('')
})
it('returns typed localized validation keys, never decoder/server messages to the UI',async()=>{
 await expect(selectCanvasBrushPattern(new File(['bad'],'bad.jpg',{type:'image/jpeg'}))).rejects.toBeInstanceOf(CanvasPatternError)
 for(const key of Object.keys(en).filter(key=>key.startsWith('canvasPattern.')) as (keyof typeof en)[]){expect(typeof en[key]).toBe('string');expect(typeof ru[key]).toBe('string');expect(en[key]).not.toBe(key);expect(ru[key]).not.toBe(key)}
})
