import {describe,it,expect} from 'vitest'
import {decodePreBrush68Checkpoint} from './preBrush68Codec'
import {BRUSH68_ROI,BRUSH68_SCISSOR,BRUSH68_FLOW_RECT} from './preBrush68Checkpoint'
describe('original prebrush68 bounded packet',()=>{
 it('keeps full1536 coordinates and two-neighbor halo without ROI rescale',()=>{expect(BRUSH68_ROI).toEqual({x:269,y:261,width:127,height:108});expect(BRUSH68_SCISSOR).toEqual([271,1169,123,104]);expect(BRUSH68_FLOW_RECT).toEqual([272/1536,1170/1536,121/1536,102/1536]);expect(6*127*108*4+3224).toBeLessThan(8*1024*1024)})
 it('rejects missing passport/retirement before decompression or GPU',async()=>{await expect(decodePreBrush68Checkpoint({})).rejects.toThrow('passport/geometry');await expect(decodePreBrush68Checkpoint({code:'a'.repeat(40),glOwnerRetired:false})).rejects.toThrow('passport/geometry')})
 it('rejects filter and phase/role shape before decode',async()=>{const p={code:'a'.repeat(40),glOwnerRetired:true,glError:0,lost:false,roi:BRUSH68_ROI,rows:Array(6).fill({phase:'before',role:'a',width:1536,height:1536,filter:'linear'}),flow:{width:31,height:26,filter:'linear'},brushCalls:[{},{}]};await expect(decodePreBrush68Checkpoint(p)).rejects.toThrow('role/order/filter')})
})
