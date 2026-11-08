import{it,expect,vi}from'vitest'
import{isBrushLibrary,type BrushDescriptor,type BrushLibrary}from'@grafetto/shared'
import{usesColorSmudgeTexture}from'../presets/colorSmudgeTexture'
import{brushPreparationPlan}from'./BrushPreparation'
import{SmudgePainter,type SmudgeContext}from'./SmudgePainter'
import{MockGL}from'../../testing/mockGL'
const a=`asset:${'a'.repeat(64)}`as const,t=`asset:${'b'.repeat(64)}`as const
function brush():BrushDescriptor{return{id:'imported-aaaaaaaaaaaaaaaaaaaaaaaa',version:103,model:'mixer',category:'paint',tip:{kind:'bitmap',mask:a,hardness:1,aspect:1,angle:0,rotation:'fixed'},texture:{id:t,strength:.75,periodPx:4,patternSize:{width:4,height:4},application:{mode:'overlay',soft:true}},mixer:{algorithm:'krita-mask',source:'previousCanvas',load:0,initialLoad:0,pickup:.6,strength:1,smearAlpha:true},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}}
function lib(d=brush()):BrushLibrary{return{schemaVersion:1,skipped:[],assets:[a,t].map(id=>({id,size:4,file:id.slice(6)+'.bin'})),brushes:[{name:'Authored static MASK with pattern',source:'kpp',warnings:[],descriptor:d}]}}
it('admits root Pixel and modern MASK105, closes104/child/family, preserves old75 and103',()=>{
 for(const mode of ['colorDodge','colorBurn','hardMixPhotoshop','hardMixSofterPhotoshop'] as const){
  const d=brush();d.version=105;d.texture!.application!.mode=mode
  expect(isBrushLibrary(lib(d))).toBe(true);expect(usesColorSmudgeTexture(d)).toBe(true);expect(brushPreparationPlan(d).capabilities).toContain('colorSmudgeTexture')
  d.version=104;expect(isBrushLibrary(lib(d))).toBe(false);expect(()=>usesColorSmudgeTexture(d)).toThrow();d.version=105
  d.model='stamp';delete d.mixer;expect(isBrushLibrary(lib(d))).toBe(true);expect(brushPreparationPlan(d).capabilities).toContain('stampEffects')
  const child=structuredClone(d);d.texture=undefined;d.behavior!.dual={brush:child,blendMode:'multiply'};expect(isBrushLibrary(lib(d))).toBe(false);expect(()=>brushPreparationPlan(d)).toThrow('root')
 }
 const old=brush();expect(isBrushLibrary(lib(old))).toBe(true);old.model='stamp';delete old.mixer;old.version=75;expect(isBrushLibrary(lib(old))).toBe(true)
})
it('actual transfer selects derived capability, uploads all4 existing alpha codes, and reuses the same mask/pattern resources',async()=>{
 const{installBrushPixels,clearImportedBrushPixels}=await import('../presets/importedBrushes')
 installBrushPixels(a,new Uint8Array(16).fill(128));installBrushPixels(t,new Uint8Array([0,64,128,255,255,128,64,0,0,64,128,255,255,128,64,0]))
 const gl=new MockGL(),p=new SmudgePainter({gl:gl as unknown as WebGLRenderingContext}as SmudgeContext),texture=gl.createTexture();Reflect.set(p,'ctx',{paper:{texture,worldSize:()=>({w:64,h:64}),scale:1,fillThreshold:0,fillCap:0},quadBuf:()=>gl.createBuffer()});p.initGL()
 try{
 const b=brush();b.version=105;b.texture!.application!.mode='colorDodge';const plan=brushPreparationPlan(b);for(const r of plan.resources)p.prepareTexture(plan.resources,r);p.prepareColorSmudgeTexture();const uploads=vi.spyOn(gl,'texImage2D'),compiles=vi.spyOn(gl,'createProgram'),draw=Reflect.get(p,'drawTransferDab')as(...args:unknown[])=>void
 for(const[mode,code]of[['colorDodge',7],['colorBurn',8],['hardMixPhotoshop',9],['hardMixSofterPhotoshop',10]]as const){b.texture!.application!.mode=mode;const wet={stamp:{aspect:1,angle:0,edgeSoftness:0,opacityScale:1,color:[.2,.5,.8]},paint:{brush:b,strength:1},seed:1,step:{pickup:.6},foregroundRate:0};draw.call(p,{buffer:{width:64,height:64,beginReplaceDraw:vi.fn(),endDraw:vi.fn()},originX:-32,originY:-64},{x:10,y:10,pressure:1,opacity:1},4,{texture},0,0,16,'lay',1,wet,{texture});const binding=Reflect.get(p,'colorSmudgeTextureTransfer')as{program:{uniforms:Map<string,unknown>}};expect(binding.program.uniforms.get('u_textureApplication')).toEqual([code,1,4,4]);expect(binding.program.uniforms.get('u_grainStrength')).toBe(.75);expect(binding.program.uniforms.get('u_colorSmudgePhotoshop')).toBe(0)}
 expect(uploads).not.toHaveBeenCalled();expect(compiles).not.toHaveBeenCalled()
 }finally{p.destroy();clearImportedBrushPixels()}
})

it('missing103 preflight rejects before source leases, imprint/gesture state and painting without lazy compilation',()=>{
 const gl=new MockGL(),allocate=vi.fn(()=>{throw Error('Scratch must not allocate')}),open=vi.fn(),p=new SmudgePainter({gl:gl as unknown as WebGLRenderingContext,createBrushScratch:allocate,openProjection:open}as SmudgeContext);p.initGL()
 const b=brush();b.version=105;b.texture!.application!.mode='colorDodge';const resolve=vi.fn(),mark=vi.fn(),target={resolveForPaint:resolve,resolveVisible:resolve,markContentPainted:mark}as unknown as import('../buffers/ILayerBuffer').ILayerBuffer
 const dab={x:10,y:10,size:8,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:0},paint={brush:b,color:[.8,.2,.6]as[number,number,number],load:0,pickup:.6,strength:.5,pressure:false,sizeMultiplier:1,curve:[[0,1],[1,1]]as[number,number][]},body=vi.fn(),compile=vi.spyOn(gl,'createProgram');Reflect.set(p,'paintBehaviorDab',body)
 const snapshots=['imprints','wetGestures','replayChunks'].map(key=>[key,Array.from((Reflect.get(p,key)as Map<unknown,unknown>).entries())]as const)
 try{expect(()=>p.paint(target,[dab],'actor',undefined,'gesture',paint)).toThrow('Modern texture103 was not prepared');expect(open).not.toHaveBeenCalled();expect(allocate).not.toHaveBeenCalled();expect(resolve).not.toHaveBeenCalled();expect(mark).not.toHaveBeenCalled();expect(body).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled();for(const[key,before]of snapshots)expect(Array.from((Reflect.get(p,key)as Map<unknown,unknown>).entries())).toEqual(before)}finally{p.destroy()}
})
