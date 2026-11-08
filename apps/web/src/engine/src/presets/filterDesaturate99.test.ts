import{it,expect,vi}from'vitest'
import{isFilterDescriptor}from'../../../../../../packages/shared/src/brushFilter'
import{MockGL}from'../../testing/mockGL'
import{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{FilterBrushPass}from'../dabs/FilterBrushPass'
// Independent exact rational PMA oracle; no production CPU desaturation helper.
const round=(n:bigint,d:bigint)=>Number((2n*n+d)/(2n*d))
function reference(p:readonly[number,number,number,number],mask:number,type:number){const [r,g,b,a]=p,lo=Math.min(r,g,b),hi=Math.max(r,g,b),gray=type===0?[BigInt(lo+hi),2n]:type===1?[2126n*BigInt(r)+7152n*BigInt(g)+722n*BigInt(b),10000n]:type===2?[299n*BigInt(r)+587n*BigInt(g)+114n*BigInt(b),1000n]:type===3?[BigInt(r+g+b),3n]:[BigInt(type===4?lo:hi),1n];const[n,d]=gray;return [...p.slice(0,3).map(c=>round(BigInt(c)*BigInt(255-mask)*d+n*BigInt(mask),255n*d)),a]}
it('pins all six independent PMA grayscale graphs and COPY coverage alpha invariance',()=>{
 const expected=[128,54,76,85,0,255]
 for(let type=0;type<6;type++)expect(reference([255,0,0,255],255,type)).toEqual([expected[type],expected[type],expected[type],255])
 for(const a of[0,64,128,255])for(const mask of[0,64,128,255])for(let type=0;type<6;type++){
  const p=[Math.floor(a/4),Math.floor(a/2),a,a]as const,v=reference(p,mask,type);expect(v[3]).toBe(a);expect(v.every(c=>c>=0&&c<=a)).toBe(true);if(mask===0)expect(v).toEqual(p)
 }
 expect(reference([12,24,48,64],255,4)).toEqual([12,12,12,64]);expect(reference([12,24,48,64],255,5)).toEqual([48,48,48,64])
})
it('admits99 exact six-mode schema and rejects below99 malformed inherited and extra controls',()=>{
 const base={version:99,model:'mixer',mixer:{source:'previousCanvas'},paperInteraction:0,behavior:{version:2,rendering:{accumulation:'directOver',blendMode:'normal',wetEdges:0,burntEdges:0}}}
 for(let type=0;type<6;type++)expect(isFilterDescriptor({...base,filter:{version:2,kind:'desaturate',type}})).toBe(true)
 for(const type of[-1,6,.5,NaN,Infinity,'0',undefined])expect(isFilterDescriptor({...base,filter:{version:2,kind:'desaturate',type}})).toBe(false)
 expect(isFilterDescriptor({...base,version:98,filter:{version:2,kind:'desaturate',type:0}})).toBe(false)
 expect(isFilterDescriptor({...base,filter:{version:2,kind:'desaturate',type:0,radiusX:0}})).toBe(false)
 expect(isFilterDescriptor({...base,filter:Object.assign(Object.create({version:2,kind:'desaturate'}),{foreign:1,type:0,other:2})})).toBe(false)
 expect(isFilterDescriptor({...base,version:95,filter:{version:2,kind:'invert'}})).toBe(true)
})
it('actual six-mode pass draws existing stroke-original only without source gather blur textures or extra samplers',()=>{
 const gl=new MockGL()as unknown as WebGLRenderingContext,tile=new AccumulationBuffer(gl,4,4),original=new AccumulationBuffer(gl,4,4),mask=new AccumulationBuffer(gl,4,4),pass=new FilterBrushPass(gl)
 const shaders=vi.spyOn(gl,'shaderSource'),textures=vi.spyOn(gl,'createTexture'),draw=vi.spyOn(gl,'drawArrays'),uniform=vi.spyOn(gl,'uniform4f'),getOrCreate=vi.fn(()=>({original,coverage:mask})),resolve=vi.fn(()=>[])
 try{
  for(const type of[0,1,2,3,4,5]as const){pass.paint({version:2,kind:'desaturate',type},{buffer:tile,originX:-4,originY:8,contentRect:null},{minX:-3.5,minY:8.5,maxX:-.5,maxY:11.5},mask,{getOrCreate,noteBrushEdgePx:()=>0},{resolveVisible:resolve,resolveForPaint:resolve});expect(uniform.mock.calls.some(c=>JSON.stringify(c.slice(1))===JSON.stringify([type,0,0,3]))).toBe(true)}
  expect(draw).toHaveBeenCalledTimes(6);expect(getOrCreate).toHaveBeenCalledTimes(6);expect(resolve).not.toHaveBeenCalled();expect(textures).not.toHaveBeenCalled()
  const shader=shaders.mock.calls.map(c=>c[1]).find(s=>s.includes('float gray;'))!;expect(shader).toContain('vec3(.2126,.7152,.0722)');expect(shader).toContain('vec3(.299,.587,.114)');expect(shader).toContain('return vec4(vec3(gray),original.a)');expect(shader.match(/uniform sampler2D/g)).toHaveLength(3)
 }finally{pass.destroy();tile.destroy();original.destroy();mask.destroy()}
})
