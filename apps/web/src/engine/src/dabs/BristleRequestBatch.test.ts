import {createBristleInkProfile,createBristleInkState} from '../presets/brushBristleInk'
import {advanceBristleInkBulk} from '../presets/brushBristleInkBulk'
import {expect,it,vi} from 'vitest'
import type {BehaviorPlaced} from '../presets/brushBehavior'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import {BristleRequestBatch} from './BristleRequestBatch'
/** Command/state model of one covered pixel, NOT a GPU rasterizer/pixel proof. */
function fixture(privateVao=false,fragDepth=false){
 const gl:any={},names='ZERO TEXTURE1 UNPACK_ALIGNMENT UNPACK_FLIP_Y_WEBGL UNPACK_PREMULTIPLY_ALPHA_WEBGL UNPACK_COLORSPACE_CONVERSION_WEBGL RGBA UNSIGNED_BYTE TEXTURE_MIN_FILTER TEXTURE_MAG_FILTER TEXTURE_WRAP_S TEXTURE_WRAP_T NEAREST CLAMP_TO_EDGE VAO_BINDING MAX_RENDERBUFFER_SIZE RENDERBUFFER_BINDING ARRAY_BUFFER_BINDING FRAMEBUFFER_BINDING CURRENT_PROGRAM VIEWPORT COLOR_WRITEMASK COLOR_CLEAR_VALUE DEPTH_FUNC DEPTH_WRITEMASK DEPTH_RANGE DEPTH_CLEAR_VALUE BLEND_EQUATION_RGB BLEND_EQUATION_ALPHA BLEND_SRC_RGB BLEND_DST_RGB BLEND_SRC_ALPHA BLEND_DST_ALPHA ACTIVE_TEXTURE TEXTURE_BINDING_2D BLEND CULL_FACE DEPTH_TEST SCISSOR_TEST STENCIL_TEST DITHER POLYGON_OFFSET_FILL SAMPLE_ALPHA_TO_COVERAGE SAMPLE_COVERAGE RENDERBUFFER ARRAY_BUFFER FRAMEBUFFER DEPTH_ATTACHMENT STENCIL_ATTACHMENT FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE NONE FRAMEBUFFER_COMPLETE TEXTURE0 TEXTURE_2D DEPTH_COMPONENT16 STATIC_DRAW STREAM_DRAW FLOAT TRIANGLES GREATER FUNC_ADD ONE ONE_MINUS_SRC_ALPHA COLOR_BUFFER_BIT DEPTH_BUFFER_BIT VERTEX_SHADER FRAGMENT_SHADER COMPILE_STATUS LINK_STATUS VERTEX_ATTRIB_ARRAY_ENABLED VERTEX_ATTRIB_ARRAY_BUFFER_BINDING VERTEX_ATTRIB_ARRAY_SIZE VERTEX_ATTRIB_ARRAY_TYPE VERTEX_ATTRIB_ARRAY_NORMALIZED VERTEX_ATTRIB_ARRAY_STRIDE VERTEX_ATTRIB_ARRAY_POINTER'.split(' ')
 names.forEach((name,i)=>gl[name]=i+1)
 let serial=0,uploaded=new Float32Array(),rank=0,requestPixel=[0,0,0,0],coveragePixel=[0,0,0,0],throwDraw=false
 const object=()=>({id:++serial}),seedBuffer=object(),s=new Map<number,any>(),caps=new Set<number>([gl.DITHER,gl.SCISSOR_TEST,gl.CULL_FACE]),textures=new Map<number,any>([[gl.TEXTURE0,object()],[gl.TEXTURE1,null],[gl.TEXTURE0+3,object()]]),attachments=new Map<any,any>(),attrs=new Map<number,any>()
 for(const [name,value] of Object.entries({MAX_RENDERBUFFER_SIZE:4096,RENDERBUFFER_BINDING:object(),ARRAY_BUFFER_BINDING:seedBuffer,FRAMEBUFFER_BINDING:object(),CURRENT_PROGRAM:object(),VIEWPORT:[3,4,5,6],COLOR_WRITEMASK:[false,true,false,true],COLOR_CLEAR_VALUE:[.1,.2,.3,.4],DEPTH_FUNC:999,DEPTH_WRITEMASK:false,DEPTH_RANGE:[.2,.8],DEPTH_CLEAR_VALUE:.75,BLEND_EQUATION_RGB:900,BLEND_EQUATION_ALPHA:901,BLEND_SRC_RGB:902,BLEND_DST_RGB:903,BLEND_SRC_ALPHA:904,BLEND_DST_ALPHA:905,ACTIVE_TEXTURE:gl.TEXTURE0+3}))s.set(gl[name],value)
 for(const key of [gl.UNPACK_ALIGNMENT,gl.UNPACK_FLIP_Y_WEBGL,gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,gl.UNPACK_COLORSPACE_CONVERSION_WEBGL])s.set(key,0)
 for(let i=0;i<6;i++)attrs.set(i,{enabled:i===1,buffer:seedBuffer,size:2,type:gl.FLOAT,normalized:false,stride:16,offset:i*4})
 const seedVao=object();let currentVao:unknown=seedVao
 const vaoStates=new Map<unknown,typeof attrs>([[seedVao,attrs]])
 const attributeState=()=>vaoStates.get(currentVao)!
 const vao={VERTEX_ARRAY_BINDING_OES:gl.VAO_BINDING,createVertexArrayOES:vi.fn(()=>{const v=object(),a=new Map<number,any>();for(let i=0;i<6;i++)a.set(i,{enabled:false,buffer:null,size:4,type:gl.FLOAT,normalized:false,stride:0,offset:0});vaoStates.set(v,a);return v}),bindVertexArrayOES:(v:unknown)=>{currentVao=v},deleteVertexArrayOES:vi.fn()}
 gl.getParameter=(p:number)=>p===gl.VAO_BINDING?currentVao:p===gl.TEXTURE_BINDING_2D?textures.get(s.get(gl.ACTIVE_TEXTURE)):s.get(p)
 gl.isEnabled=(c:number)=>caps.has(c);gl.enable=(c:number)=>caps.add(c);gl.disable=(c:number)=>caps.delete(c)
 gl.bindRenderbuffer=(_t:number,v:unknown)=>s.set(gl.RENDERBUFFER_BINDING,v);gl.bindFramebuffer=(_t:number,v:unknown)=>s.set(gl.FRAMEBUFFER_BINDING,v);gl.bindBuffer=(_t:number,v:unknown)=>s.set(gl.ARRAY_BUFFER_BINDING,v)
 gl.activeTexture=(u:number)=>s.set(gl.ACTIVE_TEXTURE,u);gl.bindTexture=(_t:number,v:unknown)=>textures.set(s.get(gl.ACTIVE_TEXTURE),v)
 gl.viewport=(...v:number[])=>s.set(gl.VIEWPORT,v);gl.colorMask=(...v:boolean[])=>s.set(gl.COLOR_WRITEMASK,v);gl.clearColor=(...v:number[])=>s.set(gl.COLOR_CLEAR_VALUE,v)
 gl.depthFunc=(v:number)=>s.set(gl.DEPTH_FUNC,v);gl.depthMask=(v:boolean)=>s.set(gl.DEPTH_WRITEMASK,v);gl.depthRange=(...v:number[])=>s.set(gl.DEPTH_RANGE,v);gl.clearDepth=(v:number)=>s.set(gl.DEPTH_CLEAR_VALUE,v)
 gl.blendEquation=(v:number)=>{s.set(gl.BLEND_EQUATION_RGB,v);s.set(gl.BLEND_EQUATION_ALPHA,v)};gl.blendEquationSeparate=(a:number,b:number)=>{s.set(gl.BLEND_EQUATION_RGB,a);s.set(gl.BLEND_EQUATION_ALPHA,b)}
 gl.blendFunc=(a:number,b:number)=>{s.set(gl.BLEND_SRC_RGB,a);s.set(gl.BLEND_SRC_ALPHA,a);s.set(gl.BLEND_DST_RGB,b);s.set(gl.BLEND_DST_ALPHA,b)};gl.blendFuncSeparate=(a:number,b:number,c:number,d:number)=>{s.set(gl.BLEND_SRC_RGB,a);s.set(gl.BLEND_DST_RGB,b);s.set(gl.BLEND_SRC_ALPHA,c);s.set(gl.BLEND_DST_ALPHA,d)}
 gl.getExtension=(name:string)=>name==='EXT_frag_depth'&&fragDepth?{}:name==='OES_vertex_array_object'&&privateVao?vao:null;gl.createShader=()=>object();gl.shaderSource=vi.fn();gl.compileShader=()=>{};gl.getShaderParameter=()=>true;gl.deleteShader=()=>{};gl.createProgram=vi.fn(()=>({...object(),uniforms:{}}));gl.attachShader=()=>{};gl.linkProgram=()=>{};gl.getProgramParameter=()=>true;gl.deleteProgram=vi.fn()
 gl.createTexture=vi.fn(object);gl.deleteTexture=vi.fn();gl.texParameteri=()=>{};gl.texImage2D=vi.fn();gl.pixelStorei=(key:number,value:number)=>s.set(key,value)
 gl.createBuffer=vi.fn(object);gl.createRenderbuffer=vi.fn(object);gl.deleteBuffer=vi.fn();gl.deleteRenderbuffer=vi.fn();gl.renderbufferStorage=vi.fn()
 gl.framebufferRenderbuffer=(_a:number,_b:number,_c:number,v:unknown)=>attachments.set(s.get(gl.FRAMEBUFFER_BINDING),v)
 gl.getFramebufferAttachmentParameter=()=>gl.NONE;gl.checkFramebufferStatus=()=>gl.FRAMEBUFFER_COMPLETE
 gl.getAttribLocation=(_p:unknown,name:string)=>['a_position','a_local','a_color','a_extent','a_inkState','a_inkAxis'].indexOf(name)
 gl.getVertexAttrib=(i:number,p:number)=>attributeState().get(i)[new Map([[gl.VERTEX_ATTRIB_ARRAY_ENABLED,'enabled'],[gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING,'buffer'],[gl.VERTEX_ATTRIB_ARRAY_SIZE,'size'],[gl.VERTEX_ATTRIB_ARRAY_TYPE,'type'],[gl.VERTEX_ATTRIB_ARRAY_NORMALIZED,'normalized'],[gl.VERTEX_ATTRIB_ARRAY_STRIDE,'stride']]).get(p)!]
 gl.getVertexAttribOffset=(i:number)=>attributeState().get(i).offset
 gl.vertexAttribPointer=(i:number,size:number,type:number,normalized:boolean,stride:number,offset:number)=>Object.assign(attributeState().get(i),{buffer:s.get(gl.ARRAY_BUFFER_BINDING),size,type,normalized,stride,offset})
 gl.enableVertexAttribArray=(i:number)=>attributeState().get(i).enabled=true;gl.disableVertexAttribArray=(i:number)=>attributeState().get(i).enabled=false
 gl.useProgram=(p:unknown)=>s.set(gl.CURRENT_PROGRAM,p);gl.getUniformLocation=(p:unknown,name:string)=>({p,name})
 gl.uniform1f=gl.uniform1i=(loc:any,v:number)=>loc.p.uniforms[loc.name]=v;gl.uniform2f=gl.uniform3f=gl.uniform4f=()=>{}
 gl.bufferData=(_t:number,v:Float32Array)=>uploaded=new Float32Array(v)
 gl.clear=vi.fn(()=>{rank=0;requestPixel=[0,0,0,0]})
 gl.drawArrays=vi.fn((_m:number,_f:number,count:number)=>{
  if(throwDraw)throw undefined
  if(caps.has(gl.DEPTH_TEST)){
   expect(s.get(gl.DEPTH_FUNC)).toBe(gl.GREATER);expect(s.get(gl.DEPTH_RANGE)).toEqual([0,1]);expect(caps.has(gl.BLEND)).toBe(false)
   for(let i=0;i<count;i+=6){const at=i*10,a=Math.round(uploaded[at+7]*255)/255,z=Math.round(a*65535);if(z>rank){rank=z;requestPixel=[uploaded[at+4]*a,uploaded[at+5]*a,uploaded[at+6]*a,a]}}
  }else{
   const opacity=s.get(gl.CURRENT_PROGRAM).uniforms.u_opacity
   coveragePixel=requestPixel.map((v,i)=>v*opacity+coveragePixel[i]*(1-requestPixel[3]*opacity))
  }
 })
 const makeBuffer=()=>({width:16,height:16,texture:object(),fbo:object(),beginReplaceDraw(){gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,16,16);gl.disable(gl.BLEND)},beginDraw(){gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,16,16);gl.enable(gl.BLEND)},endDraw(){gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD)}})
 const request=makeBuffer(),coverage=makeBuffer(),batch=new BristleRequestBatch(gl as WebGLRenderingContext)
 const snapshot=()=>({state:structuredClone([...s]),caps:[...caps].sort(),textures:structuredClone([...textures]),attrs:structuredClone([...attributeState()]),vao:currentVao})
 return{gl,batch,vao,attrs,request:request as unknown as AccumulationBuffer,coverage:coverage as unknown as AccumulationBuffer,snapshot,pixels:()=>coveragePixel,attachments,fail:()=>{throwDraw=true}}
}
const stamp=(alpha:number,color:[number,number,number],group=1)=>({x:8,y:8,radius:1,angle:0,segmentLength:4,flow:alpha,ceiling:1,color,group} as BehaviorPlaced)
it('uses ordered U8 depth rank for whole colored RGBA and keeps the previous color on ties',()=>{
 const s=fixture();s.batch.prepare(16,16);const before=s.snapshot()
 s.batch.paint([stamp(.5,[1,0,0]),stamp(.2,[0,1,0]),stamp(.5,[0,0,1]),stamp(1,[.2,.3,.4]),stamp(1,[1,1,1])],s.coverage,s.request,0,0)
 expect(s.pixels()).toEqual([expect.closeTo(.2),expect.closeTo(.3),expect.closeTo(.4),1]);expect(s.snapshot()).toEqual(before);expect(s.attachments.get(s.request.fbo)).toBeNull()
 const sources=s.gl.shaderSource.mock.calls.map((v:any[])=>v[1]).join('\n');expect(sources).toContain('2.*a_color.a-1.');expect(sources).toContain('floor(v_color.a*255.+.5)/255.')
})
it('clears rank per request, then applies each request OVER once',()=>{
 const s=fixture();s.batch.prepare(16,16)
 s.batch.paint([stamp(1,[1,0,0],1),stamp(.5,[0,0,1],2)],s.coverage,s.request,0,0)
 const a=128/255;expect(s.pixels()).toEqual([expect.closeTo(1-a),0,expect.closeTo(a),1]);expect(s.gl.clear).toHaveBeenCalledTimes(2);expect(s.gl.drawArrays).toHaveBeenCalledTimes(4)
})
it('bounds4096 hairs to two candidate draws plus one composite without per-paint storage growth',()=>{
 const s=fixture();s.batch.prepare(16,16);s.batch.prepare(16,16);expect(s.batch.depthBytes).toBe(512)
 for(let i=0;i<2;i++)s.batch.paint(Array.from({length:4096},()=>stamp(.5,[1,0,0])),s.coverage,s.request,0,0)
 expect(s.gl.drawArrays).toHaveBeenCalledTimes(6);expect(s.gl.createRenderbuffer).toHaveBeenCalledTimes(1);expect(s.gl.renderbufferStorage).toHaveBeenCalledTimes(1);expect(s.gl.createBuffer).toHaveBeenCalledTimes(2)
 s.batch.reset();expect(s.batch.depthBytes).toBe(0);expect(s.gl.deleteRenderbuffer).toHaveBeenCalledTimes(1);s.batch.prepare(16,16);s.batch.destroy();expect(s.gl.deleteRenderbuffer).toHaveBeenCalledTimes(2)
})
it('restores all changed state and detaches depth on an original throw undefined',()=>{
 const s=fixture();s.batch.prepare(16,16);const before=s.snapshot();s.fail();let caught=false,error:unknown='no'
 try{s.batch.paint([stamp(.5,[1,0,0])],s.coverage,s.request,0,0)}catch(value){caught=true;error=value}
 expect(caught).toBe(true);expect(error).toBeUndefined();expect(s.snapshot()).toEqual(before);expect(s.attachments.get(s.request.fbo)).toBeNull();expect(()=>s.batch.reset()).not.toThrow()
})
it('rejects excess request work before touching GL and refuses unprepared/aliased surfaces',()=>{
 const s=fixture();expect(()=>s.batch.paint([stamp(1,[1,0,0])],s.coverage,s.request,0,0)).toThrow('prepared')
 s.batch.prepare(16,16);const before=s.snapshot();expect(()=>s.batch.paint(Array.from({length:8193},()=>stamp(.5,[1,0,0])),s.coverage,s.request,0,0)).toThrow('8192');expect(s.snapshot()).toEqual(before)
 expect(()=>s.batch.paint([stamp(1,[1,0,0])],s.coverage,s.coverage,0,0)).toThrow('distinct')
})

it('uses a private reused VAO and restores an ambient VAO with null default pointers',()=>{
 const s=fixture(true);s.attrs.get(0).buffer=null;s.batch.prepare(16,16);const before=s.snapshot()
 s.batch.paint([stamp(.5,[1,0,0])],s.coverage,s.request,0,0);s.batch.paint([stamp(.5,[0,0,1])],s.coverage,s.request,0,0)
 expect(s.snapshot()).toEqual(before);expect(s.vao.createVertexArrayOES).toHaveBeenCalledTimes(1);s.batch.reset();expect(s.vao.deleteVertexArrayOES).toHaveBeenCalledTimes(1)
})
it('fails closed before painting when neither a private VAO nor restorable attribute pointers exist',()=>{
 const s=fixture();s.batch.prepare(16,16);s.attrs.get(0).buffer=null;const before=s.snapshot()
 expect(()=>s.batch.paint([stamp(.5,[1,0,0])],s.coverage,s.request,0,0)).toThrow('private VAO');expect(s.snapshot()).toEqual(before);expect(s.gl.drawArrays).not.toHaveBeenCalled()
 const cold=fixture();cold.attrs.get(0).buffer=null;const prior=cold.snapshot();expect(()=>cold.batch.prepare(16,16)).toThrow('private VAO');expect(cold.snapshot()).toEqual(prior);expect(cold.gl.createRenderbuffer).not.toHaveBeenCalled()
})

it('rejects more than four original requests before GL mutation rather than accepting an unbounded draw loop',()=>{
 const s=fixture();s.batch.prepare(16,16);const before=s.snapshot()
 expect(()=>s.batch.paint([1,2,3,4,5].map(group=>stamp(.5,[1,0,0],group)),s.coverage,s.request,0,0)).toThrow('four requests');expect(s.snapshot()).toEqual(before);expect(s.gl.drawArrays).not.toHaveBeenCalled()
})
it('does not replace an original undefined failure with a cleanup exception and still attempts remaining restores',()=>{
 const s=fixture();s.batch.prepare(16,16);const before=s.snapshot(),bind=s.gl.bindRenderbuffer;s.fail()
 s.gl.bindRenderbuffer=()=>{throw Error('cleanup')}
 let caught=false,error:unknown='no'
 try{s.batch.paint([stamp(.5,[1,0,0])],s.coverage,s.request,0,0)}catch(value){caught=true;error=value}
 expect(caught).toBe(true);expect(error).toBeUndefined();expect(s.snapshot()).toEqual(before);expect(s.attachments.get(s.request.fbo)).toBeNull();s.gl.bindRenderbuffer=bind;s.batch.destroy()
})

const inkSettings={depletion:[0,.5,1],useOpacity:true,useSaturation:false,useWeights:false,pressureWeight:.5,bristleLengthWeight:.5,bristleInkAmountWeight:.5,inkDepletionWeight:50}
it('prewarms one reused packed profile texture and refuses unsupported capabilities before mutation',()=>{
 const s=fixture(true),before=s.snapshot()
 expect(()=>s.batch.prepareInkProfile(inkSettings,true)).toThrow('EXT_frag_depth');expect(s.snapshot()).toEqual(before);expect(s.gl.createProgram).not.toHaveBeenCalled()
 expect(()=>s.batch.prepareInkProfile({...inkSettings,useSaturation:true},false)).toThrow('saturation');expect(s.gl.createProgram).not.toHaveBeenCalled()
 s.batch.prepareInkProfile(inkSettings,false);expect(s.snapshot()).toEqual(before);expect(s.batch.inkTextureBytes).toBe(12)
 s.batch.prepareInkProfile(inkSettings,false);expect(s.gl.texImage2D).toHaveBeenCalledTimes(1)
 s.batch.prepareInkProfile({...inkSettings,depletion:[1,0]},false);expect(s.gl.createTexture).toHaveBeenCalledTimes(1);expect(s.gl.texImage2D).toHaveBeenCalledTimes(2)
 s.batch.reset();expect(s.batch.inkTextureBytes).toBe(0);expect(s.gl.deleteTexture).toHaveBeenCalledTimes(1)
})
it('runs spatial opacity as bounded hair geometry and restores both texture units on undefined draw failure',()=>{
 const s=fixture(true,true);s.batch.prepareInkProfile(inkSettings,true);s.batch.prepareDimensions(16,16)
 const profile=createBristleInkProfile(inkSettings),state=createBristleInkState(1),span=advanceBristleInkBulk(profile,state,0,[6,8],[10,8],1,1,false)
 const stamps=Array.from({length:4096},()=>({...stamp(1,[1,0,0]),bristleInkSpan:span}))
 s.gl.drawArrays=vi.fn();const before=s.snapshot();s.batch.paint(stamps,s.coverage,s.request,0,0,{antialias:false,compositing:false})
 expect(s.gl.drawArrays).toHaveBeenCalledTimes(3);expect(s.snapshot()).toEqual(before)
 s.gl.drawArrays=()=>{throw undefined};let caught=false,error:unknown='none'
 try{s.batch.paint(stamps,s.coverage,s.request,0,0,{antialias:false,compositing:false})}catch(e){caught=true;error=e}
 expect(caught).toBe(true);expect(error).toBeUndefined();expect(s.snapshot()).toEqual(before);expect(s.attachments.get(s.request.fbo)).toBeNull()
 const shaders=s.gl.shaderSource.mock.calls.map((call:unknown[])=>String(call[1])).join('\n');expect(shaders).toContain('gl_FragDepthEXT=a');expect(shaders).toContain('v_inkState=a_inkState')
})

it('uses the non-depth bounded additive AA path without frag-depth and premultiplies request RGB once',()=>{
 const s=fixture(true);s.batch.prepareInkProfile(inkSettings,false);s.batch.prepareDimensions(16,16)
 const span=advanceBristleInkBulk(createBristleInkProfile(inkSettings),createBristleInkState(1),0,[6,8],[10,8],1,1,true),items=Array.from({length:4096},()=>({...stamp(1,[1,0,0]),bristleInkSpan:span}))
 const blend=vi.spyOn(s.gl,'blendFuncSeparate');s.gl.drawArrays=vi.fn();const before=s.snapshot()
 s.batch.paint(items,s.coverage,s.request,0,0,{antialias:true,compositing:false})
 expect(blend).toHaveBeenCalledWith(s.gl.ONE,s.gl.ZERO,s.gl.ONE,s.gl.ONE);expect(s.gl.drawArrays).toHaveBeenCalledTimes(3);expect(s.snapshot()).toEqual(before)
 const shaders=s.gl.shaderSource.mock.calls.map((call:unknown[])=>String(call[1])).join('\n');expect(shaders).toContain('texture2D(u_source,v_uv).rgb*texture2D(u_source,v_uv).a');expect(shaders).not.toContain('#extension GL_EXT_frag_depth : require')
})
it('invalidates readiness on profile upload failure and preserves original undefined plus unpack/texture state',()=>{
 const s=fixture(true);s.batch.prepareInkProfile(inkSettings,false);const before=s.snapshot(),next={...inkSettings,depletion:[1,.5,0]},upload=s.gl.texImage2D
 s.gl.texImage2D=()=>{throw undefined};let caught=false,error:unknown='none'
 try{s.batch.prepareInkProfile(next,false)}catch(e){caught=true;error=e}
 expect(caught).toBe(true);expect(error).toBeUndefined();expect(s.snapshot()).toEqual(before)
 expect(()=>s.batch.assertInkPrepared(inkSettings,false)).toThrow('not prepared');expect(()=>s.batch.assertInkPrepared(next,false)).toThrow('not prepared')
 s.gl.texImage2D=upload;s.batch.prepareInkProfile(next,false);expect(()=>s.batch.assertInkPrepared(next,false)).not.toThrow();expect(s.gl.createTexture).toHaveBeenCalledTimes(1)
})

it('streams the6686-hair author population through fixed2048 staging with one final request composite',()=>{
 const s=fixture();s.batch.prepare(16,16);const before=s.snapshot();s.batch.paint(Array.from({length:6686},()=>stamp(.5,[1,0,0])),s.coverage,s.request,0,0)
 expect(s.gl.drawArrays).toHaveBeenCalledTimes(5);expect(s.gl.createBuffer).toHaveBeenCalledTimes(2);expect(s.snapshot()).toEqual(before);expect(s.pixels()).toEqual([expect.closeTo(128/255),0,0,expect.closeTo(128/255)])
})
it('prewarms142 only explicitly and reuses fixed staging for4096 ordinary AA hairs with one request-opacity composite',()=>{
 const s=fixture(true);s.batch.preparePrograms();const oldPrograms=s.gl.createProgram.mock.calls.length
 s.batch.prepareNativeAA142();s.batch.prepareNativeAA142();expect(s.gl.createProgram.mock.calls.length).toBe(oldPrograms+1);s.batch.prepareDimensions(16,16,true)
 const before=s.snapshot(),programs=s.gl.createProgram.mock.calls.length,buffers=s.gl.createBuffer.mock.calls.length
 const items=Array.from({length:4096},()=>({...stamp(.5,[1,0,0]),ceiling:.5,bristleTrajectory142:{start:[-.2,.25]as const,end:[2.8,.25]as const}}))
 s.batch.paint(items,s.coverage,s.request,0,0,undefined,true)
 expect(s.gl.drawArrays).toHaveBeenCalledTimes(3);expect(s.gl.createProgram.mock.calls.length).toBe(programs);expect(s.gl.createBuffer.mock.calls.length).toBe(buffers);expect(s.snapshot()).toEqual(before);expect(s.gl.createRenderbuffer).not.toHaveBeenCalled()
})
it('142 rejects missing original endpoints before drawing and cannot alias the ink mode',()=>{
 const s=fixture(true);s.batch.prepareNativeAA142();s.batch.prepareDimensions(16,16,true);const before=s.snapshot()
 expect(()=>s.batch.paint([stamp(1,[1,0,0])],s.coverage,s.request,0,0,undefined,true)).toThrow('trajectory');expect(s.snapshot()).toEqual(before);expect(s.gl.drawArrays).not.toHaveBeenCalled()
 expect(()=>s.batch.paint([],s.coverage,s.request,0,0,{antialias:true,compositing:true},true)).toThrow('no-ink')
})
it('142 applies global opacity only at the request composite and restores its own state on throw undefined',()=>{
 const s=fixture(true);s.batch.prepareNativeAA142();const opacity=vi.spyOn(s.gl,'uniform1f'),before=s.snapshot(),item={...stamp(.75,[1,0,0]),ceiling:.5,bristleTrajectory142:{start:[-.9,-.9]as const,end:[-.8,-.8]as const}}
 s.batch.paint([item,item],s.coverage,s.request,0,0,undefined,true)
 expect(opacity.mock.calls.filter(([u]:any[])=>u.name==='u_opacity').map(([,value]:any[])=>value)).toEqual([.5]);expect(s.snapshot()).toEqual(before)
 s.fail();let threw=false,error:unknown='sentinel';try{s.batch.paint([item],s.coverage,s.request,0,0,undefined,true)}catch(e){threw=true;error=e}expect(threw).toBe(true);expect(error).toBeUndefined();expect(s.snapshot()).toEqual(before);expect(()=>s.batch.reset()).not.toThrow()
})
