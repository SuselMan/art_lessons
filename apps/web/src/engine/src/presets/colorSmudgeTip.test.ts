import {expect,it} from 'vitest'
import {colorSmudgeTipPixels} from './colorSmudgeTip'
it('retains source-image colours and premultiplies before filtering',()=>{
 expect([...colorSmudgeTipPixels(new Uint8Array([255,128,0]),[new Uint8Array([255,200,255]),new Uint8Array([10,100,255]),new Uint8Array([0,50,255])])]).toEqual([255,10,0,255,100,50,25,128,0,0,0,0])
})
it('rejects mismatched colour planes',()=>expect(()=>colorSmudgeTipPixels(new Uint8Array(2),[new Uint8Array(1)])).toThrow())
