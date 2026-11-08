import{it,expect,vi}from'vitest'
import{MockGL}from'../../testing/mockGL'
import{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{FilterBrushPass}from'../dabs/FilterBrushPass'
import{BrushBehaviorPainter}from'../dabs/BrushBehaviorPainter'
import{digitalBrushFromPreset}from'./digitalBrushPresets'
import type{BrushContext}from'../dabs/BrushPainter'
import type{BrushDescriptor}from'@grafetto/shared'
const Q=65535n,round=(n:bigint,d:bigint)=>(2n*n+d)/(2n*d)
// Independent integer specification: no production CPU quantizer exists.
function quant(u:bigint,steps:number){const m=Q/BigInt(steps),h=m/2n,r=u%m;return u-r+(r>h?m:0n)}
function oracle(p:readonly[number,number,number,number],mask:number,steps:number,rgbOnly=false){const a=BigInt(p[3]),qa=rgbOnly?a*257n:quant(a*257n,steps),M=BigInt(mask),alpha=Number(round(a*(255n-M)*Q+qa*M*255n,255n*Q));return[...p.slice(0,3).map(c=>{const u=a?round(BigInt(c)*Q,a):0n,q=quant(u,steps);return Number(round(BigInt(c)*(255n-M)*Q*Q+q*qa*M*255n,255n*Q*Q))}),alpha]}
it('pins native U16-step strict ties and alpha quantization independently; textbook levels/RGB-only counterfactuals differ',()=>{
 expect(quant(32896n,2)).toBe(32767n);expect(quant(32896n,16)).toBe(32760n);expect(quant(49344n,16)).toBe(49140n);expect(quant(4681n,7)).toBe(0n);expect(quant(4682n,7)).toBe(9362n)
 expect(oracle([128,128,128,255],255,2)).toEqual([127,127,127,255]);expect(oracle([128,0,0,128],255,2)).toEqual([127,0,0,127]);expect(oracle([128,0,0,128],255,2,true)[3]).toBe(128)
 const textbook=Math.round(128/255*(2-1))*255/(2-1);expect(textbook).toBe(255);expect(textbook).not.toBe(oracle([128,128,128,255],255,2)[0])
 for(const steps of[2,3,7,16,128])for(const a of[0,64,128,255])for(const mask of[0,64,128,255]){const p=[Math.floor(a/4),Math.floor(a/2),a,a]as const,v=oracle(p,mask,steps);expect(v.every(c=>c>=0&&c<=255)).toBe(true);expect(v.slice(0,3).every(c=>c<=v[3])).toBe(true);if(mask===0)expect(v).toEqual(p)}
})
it('bounded integer domain covers every channel/steps, max products below2^24, no steps-minus-one level substitution',()=>{
 for(let steps=2;steps<=128;steps++)for(let c=0;c<=255;c++){const q=quant(BigInt(c)*257n,steps);expect(q>=0n&&q<=Q).toBe(true)}
 expect(255*65535).toBeLessThan(2**24)
})
it('actual pass uses existing original/mask only: no gather, new textures or blur passes, and preserves all old pointwise branches',()=>{
 const gl=new MockGL()as unknown as WebGLRenderingContext,tile=new AccumulationBuffer(gl,4,4),original=new AccumulationBuffer(gl,4,4),mask=new AccumulationBuffer(gl,4,4),pass=new FilterBrushPass(gl),shaders=vi.spyOn(gl,'shaderSource'),textures=vi.spyOn(gl,'createTexture'),draw=vi.spyOn(gl,'drawArrays'),uniform=vi.spyOn(gl,'uniform4f'),getOrCreate=vi.fn(()=>({original,coverage:mask})),resolve=vi.fn(()=>[])
 try{for(const steps of[2,7,16,128])pass.paint({version:2,kind:'posterize',steps},{buffer:tile,originX:-4,originY:8,contentRect:null},{minX:-3.5,minY:8.5,maxX:-.5,maxY:11.5},mask,{getOrCreate,noteBrushEdgePx:()=>0},{resolveVisible:resolve,resolveForPaint:resolve})
 expect(draw).toHaveBeenCalledTimes(4);expect(getOrCreate).toHaveBeenCalledTimes(4);expect(resolve).not.toHaveBeenCalled();expect(textures).not.toHaveBeenCalled();expect(uniform.mock.calls.some(c=>JSON.stringify(c.slice(1))===JSON.stringify([16,0,0,4]))).toBe(true)
 const shader=shaders.mock.calls.map(c=>c[1]).find(s=>s.includes('p117posterize'))!;expect(shader).toContain('r>h?m:0.');expect(shader).toContain('q.rgb*q.a');expect(shader).toContain('p117channel(a*257.,m,h)');expect(shader).toContain('r<0.?q-1.:(r>=d?q+1.:q)');expect(shader).not.toContain('steps-1');expect(shader.match(/uniform sampler2D/g)).toHaveLength(3)
 expect(shader).toContain('filtered=vec4(original.aaa-original.rgb,original.a)');expect(shader).toContain('filtered=vec4(vec3(gray),original.a)');expect(shader).toContain('gl_FragColor=mix(original,filtered,mask)')
 }finally{pass.destroy();tile.destroy();original.destroy();mask.destroy()}
})
it('low-level invalid117 shape fails before compile, textures, original snapshot or any target access',()=>{
 const gl=new MockGL()as unknown as WebGLRenderingContext,pass=new FilterBrushPass(gl),program=vi.spyOn(gl,'createProgram'),texture=vi.spyOn(gl,'createTexture'),unexpected=()=>{throw Error('Unexpected target mutation')};const target=new Proxy({},{get:unexpected})
 try{for(const steps of[1,129,2.5,NaN,Infinity])expect(()=>pass.paint({version:2,kind:'posterize',steps},target as Parameters<FilterBrushPass['paint']>[1],{}as Parameters<FilterBrushPass['paint']>[2],{}as AccumulationBuffer,{getOrCreate:unexpected,noteBrushEdgePx:unexpected},{resolveForPaint:unexpected})).toThrow('Invalid Posterize117 filter');expect(program).not.toHaveBeenCalled();expect(texture).not.toHaveBeenCalled()}finally{pass.destroy()}
})
it('whole painter rejects invalid117 revision/steps/scope before state, allocations and external callbacks',()=>{
 const unexpected=()=>{throw Error('Unexpected state/resource access')},ctx={get gl(){return unexpected()}}as unknown as BrushContext,painter=new BrushBehaviorPainter(ctx,unexpected,unexpected,unexpected,unexpected)
 const valid=():BrushDescriptor=>{const b=structuredClone(digitalBrushFromPreset('hard-round'));b.version=117;b.model='mixer';b.paperInteraction=0;b.mixer={load:0,initialLoad:0,pickup:1,strength:1,source:'previousCanvas'};b.filter={version:2,kind:'posterize',steps:16};b.behavior={version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}};return b}
 for(const change of[(b:BrushDescriptor)=>{b.version=116},(b:BrushDescriptor)=>{Reflect.set(b.filter!,'steps',1)},(b:BrushDescriptor)=>{b.behavior!.erase=true},(b:BrushDescriptor)=>{b.behavior!.dual={brush:valid(),blendMode:'normal'}},(b:BrushDescriptor)=>{Reflect.set(b,'clone',null)},(b:BrushDescriptor)=>{Reflect.set(b,'clone',{})},(b:BrushDescriptor)=>{Reflect.set(b,'mypaint',null)},(b:BrushDescriptor)=>{Reflect.set(b,'tangentNormal',{})}]){const b=valid();change(b);const state={retained:42},before=structuredClone(state);expect(()=>painter.paint({}as Parameters<BrushBehaviorPainter['paint']>[0],[],{}as Parameters<BrushBehaviorPainter['paint']>[2],b,{}as Parameters<BrushBehaviorPainter['paint']>[4],[1,0,0],state as unknown as Parameters<BrushBehaviorPainter['paint']>[6])).toThrow('Invalid Posterize117 brush scope');expect(state).toEqual(before)}
})
