import{it,expect,vi}from'vitest'
import{isFilterDescriptor}from'../../../../../../packages/shared/src/brushFilter'
import{MockGL}from'../../testing/mockGL'
import{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{FilterBrushPass}from'../dabs/FilterBrushPass'
function reference(pixel:readonly[number,number,number,number],mask:number){const a=pixel[3];return[...pixel.slice(0,3).map(c=>Number((2n*(BigInt(c)*BigInt(255-mask)+BigInt(a-c)*BigInt(mask))+255n)/510n)),a]}
it('pins independent integer expected fixtures for alpha and COPY coverage without claiming native ICC equality',()=>{
 expect(reference([0,0,0,0],255)).toEqual([0,0,0,0])
 expect(reference([12,8,0,64],0)).toEqual([12,8,0,64])
 expect(reference([12,8,0,64],64)).toEqual([22,20,16,64])
 expect(reference([12,8,0,64],255)).toEqual([52,56,64,64])
 for(const a of[0,64,128,255])for(const c of[0,Math.floor(a/2),a])expect(reference([c,c,c,a],255)).toEqual([a-c,a-c,a-c,a])
})
it('admits only explicit95 invert shape while preserving spatial controls',()=>{
 const base={version:95,model:'mixer',mixer:{source:'previousCanvas'},paperInteraction:0,behavior:{version:2,rendering:{accumulation:'directOver',blendMode:'normal',wetEdges:0,burntEdges:0}}}
 expect(isFilterDescriptor({...base,filter:{version:2,kind:'invert'}})).toBe(true)
 expect(isFilterDescriptor({...base,filter:Object.assign(Object.create({version:2,kind:'invert'}),{foreign:1,other:2})})).toBe(false)
 expect(isFilterDescriptor({...base,version:94,filter:{version:2,kind:'invert'}})).toBe(false)
 expect(isFilterDescriptor({...base,filter:{version:2,kind:'invert',radiusX:0}})).toBe(false)
 expect(isFilterDescriptor({...base,filter:{version:1,kind:'invert',radiusX:0,radiusY:0,amount:0,threshold:0,lightnessOnly:false}})).toBe(false)
 expect(isFilterDescriptor({...base,version:52,filter:{version:1,kind:'gaussian',radiusX:5,radiusY:5,amount:.5,threshold:0,lightnessOnly:true}})).toBe(true)
})
it('actual invert pass uses original tile once with no gather, blur, new texture or source-region allocation',()=>{
 const gl=new MockGL()as unknown as WebGLRenderingContext,tileBuffer=new AccumulationBuffer(gl,4,4),original=new AccumulationBuffer(gl,4,4),mask=new AccumulationBuffer(gl,4,4),pass=new FilterBrushPass(gl)
 const shaders=vi.spyOn(gl,'shaderSource'),textures=vi.spyOn(gl,'createTexture'),draw=vi.spyOn(gl,'drawArrays'),uniform=vi.spyOn(gl,'uniform4f'),getOrCreate=vi.fn(()=>({original,coverage:mask})),visible=vi.fn(()=>[]),paint=vi.fn(()=>[])
 try{
  pass.paint({version:2,kind:'invert'},{buffer:tileBuffer,originX:-4,originY:8,contentRect:null},{minX:-4,minY:8,maxX:0,maxY:12},mask,{getOrCreate,noteBrushEdgePx:()=>0},{resolveVisible:visible,resolveForPaint:paint})
  expect(shaders.mock.calls.some(call=>call[1].includes('original.aaa-original.rgb,original.a'))).toBe(true)
  expect(getOrCreate).toHaveBeenCalledExactlyOnceWith(tileBuffer);expect(visible).not.toHaveBeenCalled();expect(paint).not.toHaveBeenCalled();expect(textures).not.toHaveBeenCalled();expect(draw).toHaveBeenCalledTimes(1)
  expect(uniform.mock.calls.some(call=>JSON.stringify(call.slice(1))==='[0,0,0,2]')).toBe(true)
 }finally{pass.destroy();tileBuffer.destroy();original.destroy();mask.destroy()}
})
