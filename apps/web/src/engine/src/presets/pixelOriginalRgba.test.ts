import {expect,it} from 'vitest'
import {capturePixelOriginalRgbaView,pixelOriginalRgbaPigment,assertPixelOriginalRgba,usesPixelOriginalRgba,pixelOriginalRgbaFrames} from './pixelOriginalRgba'
import {colorSmudgeTipPixels} from './colorSmudgeTip'
import {digitalBrushFromPreset} from './digitalBrushPresets'
it('consumes the common premultiplied cache data without foreground tint or another packing law',()=>{
 const alpha=new Uint8Array([255,128,0]),channels=[new Uint8Array([30,255,255]),new Uint8Array([220,64,200]),new Uint8Array([110,0,100])]
 const packed=colorSmudgeTipPixels(alpha,channels)
 expect([...packed]).toEqual([30,220,110,255,128,32,0,128,0,0,0,0])
 expect(pixelOriginalRgbaPigment([packed[4]/255,packed[5]/255,packed[6]/255,packed[7]/255])).toEqual([1,.25,0])
 expect(pixelOriginalRgbaPigment([0,0,0,0])).toEqual([0,0,0])
 expect(pixelOriginalRgbaPigment([30/255,220/255,110/255,1])).toEqual([30/255,220/255,110/255])
 expect(()=>pixelOriginalRgbaPigment([1,0,0,.5])).toThrow(RangeError)
})
it('captures only immutable geometry and delegates every liveness check to the same cache owner',()=>{
 let retired=false,checks=0
 const crop={x:2,y:1,width:4,height:6},texture={}as WebGLTexture
 const view={texture,width:8,height:8,crop,assertCurrent(){checks++;if(retired)throw undefined}}
 const captured=capturePixelOriginalRgbaView(view)
 expect(checks).toBe(2);expect(captured.texture).toBe(texture);expect(captured.bounds).toEqual([.25,.125,.5,.75])
 crop.x=100;expect(captured.bounds).toEqual([.25,.125,.5,.75]);expect(Object.isFrozen(captured.bounds)).toBe(true)
 captured.assertCurrent();expect(checks).toBe(3)
 retired=true;let failed=false;try{captured.assertCurrent()}catch(e){failed=true;expect(e).toBeUndefined()}expect(failed).toBe(true)
})
it('rejects invalid views before any pixel or texture work',()=>{
 const view={texture:{}as WebGLTexture,width:8,height:8,crop:{x:0,y:0,width:8,height:8},assertCurrent(){}}
 for(const patch of [{width:0},{width:Infinity},{crop:{x:-1,y:0,width:8,height:8}},{crop:{x:0,y:0,width:9,height:8}},{crop:{x:0,y:0,width:NaN,height:8}}])expect(()=>capturePixelOriginalRgbaView({...view,...patch})).toThrow(RangeError)
})
it('closes unsupported RGB adjustments and combinations rather than treating color as coverage',()=>{
 const b=structuredClone(digitalBrushFromPreset('hard-round'));b.model='stamp';b.version=84;b.tip={kind:'bitmap',hardness:1,aspect:1,angle:0,rotation:'fixed',mask:'asset:'+ 'a'.repeat(64)as `asset:${string}`,color:{planes:['asset:'+ 'b'.repeat(64),'asset:'+ 'c'.repeat(64),'asset:'+ 'd'.repeat(64)]as [`asset:${string}`,`asset:${string}`,`asset:${string}`]}}
 expect(usesPixelOriginalRgba(b)).toBe(true);expect(()=>assertPixelOriginalRgba(b)).not.toThrow()
 b.behavior={version:2,edgeBleed:{pressure:.1,tilt:0}};expect(()=>assertPixelOriginalRgba(b)).toThrow('adjustments')
 b.behavior={version:2,modulations:{hue:[{control:'pressure',minimum:0,jitter:0}]}};expect(()=>assertPixelOriginalRgba(b)).toThrow('adjustments')
 b.behavior={version:2};b.tip.autoNoise={version:1,density:.5,randomness:0};expect(()=>assertPixelOriginalRgba(b)).toThrow('combination');delete b.tip.autoNoise
 b.version=83;expect(()=>assertPixelOriginalRgba(b)).toThrow('combination')
})

it('retains paired RGB identity when pipe frames share the SAME alpha asset',()=>{
 const b=structuredClone(digitalBrushFromPreset('hard-round'));b.model='stamp';b.version=84
 const a=`asset:${'e'.repeat(64)}`as const,r=`asset:${'f'.repeat(64)}`as const,g=`asset:${'1'.repeat(64)}`as const,blue=`asset:${'2'.repeat(64)}`as const
 b.tip={kind:'bitmap',mask:a,hardness:1,aspect:1,angle:0,rotation:'fixed',animation:{mode:'incremental',frames:[a,a]},color:{planes:[r,g,blue],frames:[[r,g,blue],[blue,r,g]]}}
 const rows=pixelOriginalRgbaFrames(b)
 expect(rows.map(row=>row.id)).toEqual([a,a]);expect(rows[0].planes).toEqual([r,g,blue]);expect(rows[1].planes).toEqual([blue,r,g])
 const color=b.tip.color
 if(!color||!('planes' in color)||!color.frames)throw Error('Missing authored RGB frames')
 color.frames[1][0]=r
 expect(rows[1].planes).toEqual([blue,r,g]);expect(Object.isFrozen(rows[1].planes)).toBe(true)
 color.frames.pop();expect(()=>pixelOriginalRgbaFrames(b)).toThrow('frame planes differ')
})
