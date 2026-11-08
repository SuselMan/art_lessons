import{it,expect,vi}from'vitest'
import{isBrushLibrary,type BrushDescriptor,type BrushLibrary}from'@grafetto/shared'
import{usesColorSmudgeTexture}from'../presets/colorSmudgeTexture'
import{textureAlphaExtended,TEXTURE_ALPHA_EXTENDED_GLSL}from'../raster/textureAlphaModes'
import{wetTransferFragment,colorSmudgeTextureFragment}from'../raster/wetMixShaders'
import{BRUSH_TEXTURE_APPLICATION_GLSL}from'../raster/brushBehaviorShaders'
import{brushPreparationPlan}from'./BrushPreparation'
import{SmudgePainter,type SmudgeContext}from'./SmudgePainter'
import{MockGL}from'../../testing/mockGL'
const a=`asset:${'a'.repeat(64)}`as const,t=`asset:${'b'.repeat(64)}`as const
function brush():BrushDescriptor{return{id:'imported-aaaaaaaaaaaaaaaaaaaaaaaa',version:103,model:'mixer',category:'paint',tip:{kind:'bitmap',mask:a,hardness:1,aspect:1,angle:0,rotation:'fixed'},texture:{id:t,strength:.75,periodPx:4,patternSize:{width:4,height:4},application:{mode:'overlay',soft:true}},mixer:{algorithm:'krita-mask',source:'previousCanvas',load:0,initialLoad:0,pickup:.6,strength:1,smearAlpha:true},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}}
function lib(d=brush()):BrushLibrary{return{schemaVersion:1,skipped:[],assets:[a,t].map(id=>({id,size:4,file:id.slice(6)+'.bin'})),brushes:[{name:'Authored static MASK with pattern',source:'kpp',warnings:[],descriptor:d}]}}
it('shared admits4 modern modes and old1/2, rejects revision/source/algorithm/material/dual and nested child',()=>{
 for(const mode of['darken','overlay','linearDodge','linearBurn']as const){const d=brush();d.texture!.application!.mode=mode;expect(isBrushLibrary(lib(d))).toBe(true);expect(usesColorSmudgeTexture(d)).toBe(true)}
 for(const mutate of[(d:BrushDescriptor)=>{d.version=102},(d:BrushDescriptor)=>{d.mixer!.source='projectionCanvas'},(d:BrushDescriptor)=>{delete d.mixer!.algorithm},(d:BrushDescriptor)=>{d.mixer!.colorRateComposite='hardMixPhotoshop'},(d:BrushDescriptor)=>{d.tip.animation={mode:'incremental',frames:[a]}},(d:BrushDescriptor)=>{d.behavior!.dual={brush:brush(),blendMode:'normal'}}]){const d=brush();mutate(d);expect(isBrushLibrary(lib(d))).toBe(false);expect(()=>usesColorSmudgeTexture(d)).toThrow('texture103')}
 for(const mode of['multiply','subtract']as const){const d=brush();d.version=36;d.texture!.application!.mode=mode;expect(isBrushLibrary(lib(d))).toBe(true);expect(usesColorSmudgeTexture(d)).toBe(false);expect(brushPreparationPlan(d).capabilities).toContain('colorSmudge')}
 const child=brush(),parent=brush();parent.model='stamp';delete parent.mixer;delete parent.texture;parent.behavior!.dual={brush:child,blendMode:'normal',sampling:'independent'};expect(isBrushLibrary(lib(parent))).toBe(false)
})
it('derived actual program injects canonical graph once without new samplers or altering old shader body',()=>{
 const old=wetTransferFragment(true,true,true,true),extended=colorSmudgeTextureFragment();expect(old).not.toContain(TEXTURE_ALPHA_EXTENDED_GLSL);expect(extended.split(TEXTURE_ALPHA_EXTENDED_GLSL)).toHaveLength(2)
 const replacement=TEXTURE_ALPHA_EXTENDED_GLSL+BRUSH_TEXTURE_APPLICATION_GLSL.replace(' if(application.x<1.5)',' if(application.x>2.5)return brushTextureAlphaExtended(a,t,s,application);\n if(application.x<1.5)');expect(extended.replace(replacement,BRUSH_TEXTURE_APPLICATION_GLSL)).toBe(old)
 const samplers=(s:string)=>s.match(/uniform sampler2D \w+/g);expect(samplers(extended)).toEqual(samplers(old));expect(brushPreparationPlan(brush()).capabilities).toContain('colorSmudgeTexture')
})
it('native operand roles match independent rational integer witnesses, including transparent linearDodge and soft/hard strength0',()=>{
 const B=255n,N=(x:bigint)=>Number(x)/Number(B*B*B)
 for(const mode of['darken','overlay','linearDodge','linearBurn']as const)for(const aa of[0,64,128,255])for(const tt of[0,64,128,255])for(const ss of[0,64,128,255])for(const soft of[false,true]){
 const a=BigInt(aa),t=BigInt(tt),s=BigInt(ss),src=soft?B*B-B*s+t*s:t*B,dst=soft?a*B:a*s,den=B*B;let numerator:bigint,divisor:bigint
 if(mode==='linearDodge'){numerator=a===0n?0n:(soft?a*B+t*s:t*B+a*s);if(numerator>den)numerator=den;divisor=den}
 else if(mode==='darken'){numerator=src<dst?src:dst;divisor=den}
 else if(mode==='linearBurn'){numerator=src+dst-den;if(numerator<0n)numerator=0n;divisor=den}
 else{numerator=dst*2n<=den?2n*src*dst:den*den-2n*(den-src)*(den-dst);divisor=den*den}
 expect(textureAlphaExtended(mode,aa/255,tt/255,ss/255,soft)).toBeCloseTo(Number(numerator)/Number(divisor),13)
 }
 expect(N(0n)).toBe(0)
})
it('prewarms only one actual derived program, reuses it, releases on destroy and forgets on loss',()=>{
 const gl=new MockGL(),p=new SmudgePainter({gl:gl as unknown as WebGLRenderingContext}as SmudgeContext);p.initGL();const compile=vi.spyOn(gl,'createProgram');p.prepareColorSmudgeTexture();const count=compile.mock.calls.length;p.prepareColorSmudgeTexture();expect(compile.mock.calls.length).toBe(count);const owned=Reflect.get(p,'colorSmudgeTextureTransfer')as{program:WebGLProgram};expect(owned).toBeDefined();const release=vi.spyOn(gl,'deleteProgram');p.destroy();expect(release).toHaveBeenCalledWith(owned.program)
 const lost=new SmudgePainter({gl:gl as unknown as WebGLRenderingContext}as SmudgeContext);lost.initGL();lost.prepareColorSmudgeTexture();lost.forget();expect(Reflect.get(lost,'colorSmudgeTextureTransfer')).toBeUndefined();lost.destroy()
})
it('actual transfer selects derived capability, uploads all4 existing alpha codes, and reuses the same mask/pattern resources',async()=>{
 const{installBrushPixels,clearImportedBrushPixels}=await import('../presets/importedBrushes')
 installBrushPixels(a,new Uint8Array(16).fill(128));installBrushPixels(t,new Uint8Array([0,64,128,255,255,128,64,0,0,64,128,255,255,128,64,0]))
 const gl=new MockGL(),p=new SmudgePainter({gl:gl as unknown as WebGLRenderingContext}as SmudgeContext),texture=gl.createTexture();Reflect.set(p,'ctx',{paper:{texture,worldSize:()=>({w:64,h:64}),scale:1,fillThreshold:0,fillCap:0},quadBuf:()=>gl.createBuffer()});p.initGL()
 try{
 const b=brush(),plan=brushPreparationPlan(b);for(const r of plan.resources)p.prepareTexture(plan.resources,r);p.prepareColorSmudgeTexture();const uploads=vi.spyOn(gl,'texImage2D'),compiles=vi.spyOn(gl,'createProgram'),draw=Reflect.get(p,'drawTransferDab')as(...args:unknown[])=>void
 for(const[mode,code]of[['darken',3],['overlay',4],['linearDodge',5],['linearBurn',6]]as const){b.texture!.application!.mode=mode;const wet={stamp:{aspect:1,angle:0,edgeSoftness:0,opacityScale:1,color:[.2,.5,.8]},paint:{brush:b,strength:1},seed:1,step:{pickup:.6},foregroundRate:0};draw.call(p,{buffer:{width:64,height:64,beginReplaceDraw:vi.fn(),endDraw:vi.fn()},originX:-32,originY:-64},{x:10,y:10,pressure:1,opacity:1},4,{texture},0,0,16,'lay',1,wet,{texture});const binding=Reflect.get(p,'colorSmudgeTextureTransfer')as{program:{uniforms:Map<string,unknown>}};expect(binding.program.uniforms.get('u_textureApplication')).toEqual([code,1,4,4]);expect(binding.program.uniforms.get('u_grainStrength')).toBe(.75);expect(binding.program.uniforms.get('u_colorSmudgePhotoshop')).toBe(0)}
 expect(uploads).not.toHaveBeenCalled();expect(compiles).not.toHaveBeenCalled()
 }finally{p.destroy();clearImportedBrushPixels()}
})

it('missing103 preflight rejects before source leases, imprint/gesture state and painting without lazy compilation',()=>{
 const gl=new MockGL(),allocate=vi.fn(()=>{throw Error('Scratch must not allocate')}),open=vi.fn(),p=new SmudgePainter({gl:gl as unknown as WebGLRenderingContext,createBrushScratch:allocate,openProjection:open}as SmudgeContext);p.initGL()
 const b=brush(),resolve=vi.fn(),mark=vi.fn(),target={resolveForPaint:resolve,resolveVisible:resolve,markContentPainted:mark}as unknown as import('../buffers/ILayerBuffer').ILayerBuffer
 const dab={x:10,y:10,size:8,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:0},paint={brush:b,color:[.8,.2,.6]as[number,number,number],load:0,pickup:.6,strength:.5,pressure:false,sizeMultiplier:1,curve:[[0,1],[1,1]]as[number,number][]},body=vi.fn(),compile=vi.spyOn(gl,'createProgram');Reflect.set(p,'paintBehaviorDab',body)
 const snapshots=['imprints','wetGestures','replayChunks'].map(key=>[key,Array.from((Reflect.get(p,key)as Map<unknown,unknown>).entries())]as const)
 try{expect(()=>p.paint(target,[dab],'actor',undefined,'gesture',paint)).toThrow('Modern texture103 was not prepared');expect(open).not.toHaveBeenCalled();expect(allocate).not.toHaveBeenCalled();expect(resolve).not.toHaveBeenCalled();expect(mark).not.toHaveBeenCalled();expect(body).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled();for(const[key,before]of snapshots)expect(Array.from((Reflect.get(p,key)as Map<unknown,unknown>).entries())).toEqual(before)}finally{p.destroy()}
})
