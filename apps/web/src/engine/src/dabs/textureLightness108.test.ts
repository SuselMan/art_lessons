import{it,expect,vi}from'vitest'
import{isBrushLibrary,brushAssetIds,type BrushDescriptor,type BrushLibrary}from'@grafetto/shared'
import{usesTextureLightness,textureLightnessPixels}from'../presets/textureLightness'
import{BrushPainter,type BrushContext}from'./BrushPainter'
import type{BehaviorScratch}from'./BrushBehaviorPainter'
import{brushPreparationResources,brushPreparationBytes,brushPreparationTransientBytes,brushTextureResourceKey}from'./BrushPreparation'
import{createBrushStampFragment,BRUSH_LIGHTNESS_GLSL}from'../raster/brushBehaviorShaders'
import{installBrushPixels,clearImportedBrushPixels}from'../presets/importedBrushes'
import{MockGL}from'../../testing/mockGL'
const mask=`asset:${'a'.repeat(64)}`as const,gray=`asset:${'b'.repeat(64)}`as const,alpha=`asset:${'c'.repeat(64)}`as const
function brush():BrushDescriptor{return{id:'imported-aaaaaaaaaaaaaaaaaaaaaaaa',version:108,model:'stamp',category:'paint',tip:{kind:'bitmap',mask,hardness:1,aspect:1,angle:0,rotation:'fixed'},texture:{id:gray,material:{kind:'lightness',alpha},strength:0,periodPx:4,patternSize:{width:4,height:4}},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}}
function lib(d=brush()):BrushLibrary{return{schemaVersion:1,skipped:[],assets:[mask,gray,alpha].map(id=>({id,size:4,file:id.slice(6)+'.bin'})),brushes:[{name:'Authored Lightness108',source:'kpp',warnings:[],descriptor:d}]}}
function fixture(){installBrushPixels(mask,new Uint8Array(16).fill(128));installBrushPixels(gray,new Uint8Array(16).fill(127));installBrushPixels(alpha,new Uint8Array(16).fill(64));const gl=new MockGL(),white=gl.createTexture(),quad=gl.createBuffer();const painter=new BrushPainter({gl:gl as unknown as WebGLRenderingContext,quadBuf:()=>quad,screenBuf:()=>quad,paper:{texture:white,scale:1,worldSize:()=>({w:64,h:64})}}as unknown as BrushContext);painter.initGL();return{gl,painter}}
it('108 admits independent alpha ref and rejects historical reinterpretation, colour/dual/child/soft flags and shape aliases',()=>{
 const d=brush();expect(isBrushLibrary(lib(d))).toBe(true);expect(brushAssetIds(d)).toContain(alpha);expect(usesTextureLightness(d)).toBe(true)
 for(const change of[(b:BrushDescriptor)=>{b.version=107},(b:BrushDescriptor)=>{b.texture!.application={mode:'multiply',soft:false}},(b:BrushDescriptor)=>{b.tip.color={planes:[mask,mask,mask]}},(b:BrushDescriptor)=>{b.tip.animation={mode:'incremental',frames:[mask]}},(b:BrushDescriptor)=>{b.behavior!.dual={brush:brush(),blendMode:'normal'}},(b:BrushDescriptor)=>{b.model='mixer'},(b:BrushDescriptor)=>{b.behavior!.rendering!.accumulation='maxAlpha'},(b:BrushDescriptor)=>{b.texture!.eraseId=gray}]){const bad=brush();change(bad);expect(isBrushLibrary(lib(bad))).toBe(false);expect(()=>usesTextureLightness(bad)).toThrow()}
 const partial=lib();partial.assets.pop();expect(isBrushLibrary(partial)).toBe(false);const mismatch=lib();mismatch.assets[2].size=8;expect(isBrushLibrary(mismatch)).toBe(false)
 const parent=brush(),child=brush();delete parent.texture;parent.behavior!.dual={brush:child,blendMode:'normal'};expect(isBrushLibrary(lib(parent))).toBe(false)
})
it('packing retains straight gray at transparent pixels, checks padding, keys alpha+grid, accounts fullGPU+peak staging',()=>{
 const g=new Uint8Array([255,127,0,0,87,39,0,0,0,0,0,0,0,0,0,0]),a=new Uint8Array([0,128,0,0,255,255,0,0,0,0,0,0,0,0,0,0]);const packed=textureLightnessPixels(g,a,2,2);expect(Array.from(packed.slice(0,8))).toEqual([255,255,255,0,127,127,127,128]);expect(packed.length).toBe(64)
 expect(()=>textureLightnessPixels(g,new Uint8Array(4),2,2)).toThrow();const corrupt=a.slice();corrupt[15]=1;expect(()=>textureLightnessPixels(g,corrupt,2,2)).toThrow('padding')
 const resource={painter:'stamp' as const,id:gray,grain:true,discrete:true as const,patternAlpha:alpha,patternSize:{width:2,height:2}};expect(brushPreparationBytes([resource],()=>4)).toBe(64);installBrushPixels(gray,g);try{expect(brushPreparationTransientBytes([resource])).toBe(64)}finally{clearImportedBrushPixels()}
 expect(brushTextureResourceKey(resource)).not.toBe(brushTextureResourceKey({...resource,patternAlpha:mask}));expect(brushTextureResourceKey(resource)).not.toBe(brushTextureResourceKey({...resource,patternSize:{width:4,height:4}}))
})
it('derived shader uses canonical lightness once, clamps ALREADY COLOURED alpha BEFORE later flow/opacity and adds no samplers',()=>{
 const old=createBrushStampFragment(true,true,true,true),next=createBrushStampFragment(true,true,true,true,false,true);expect(old).not.toContain('u_textureMaterial');expect(next).toContain(BRUSH_LIGHTNESS_GLSL);expect(next).toContain('pigment=brushMaterialColor(pigment,pattern.r,clamp(u_texStrength,0.0,1.0));');expect(next).toContain('shape=min(shape,pattern.a);');expect(next.indexOf('shape=min(shape,pattern.a);')).toBeLessThan(next.indexOf('float amount = shape * v_opacity;'));expect(next.match(/uniform sampler2D \w+/g)).toEqual(old.match(/uniform sampler2D \w+/g));expect(()=>createBrushStampFragment(true,true,true,true,true,true)).toThrow()
 // Rational native specification: dabAlpha already includes foregroundAlpha;
 // source opacity/flow are separately later. This RGBA producer is NOT admitted108.
 const min=(a:bigint,b:bigint)=>a<b?a:b,den=1000n,shape=500n,fg=500n,pat=400n;expect(min(shape*fg/den,pat)).toBe(250n);expect(min(shape,pat)*fg/den).toBe(200n)
 const d=brush();d.tip.color={planes:[mask,mask,mask]};expect(isBrushLibrary(lib(d))).toBe(false)
 // Strength0 neutral polynomial: x=1/2 => ((1-B)+2B)/4=(1+B)/4=L.
 for(const l of[0n,64n,127n,255n]){const B=4n*l-255n;expect((255n+B)).toBe(4n*l)}
 expect(Math.min(64,255)).toBe(64);expect(Math.min(0,255)).toBe(0);expect(Math.min(255,0)).toBe(0)
})
it('actual facade owns one packed upload/program, reuses them, and failcloses unprepared/lost state before scratch mutation',()=>{
 const f=fixture(),b=brush(),ctx=Reflect.get(f.painter,'behavior'),uploads=vi.spyOn(f.gl,'texImage2D'),compile=vi.spyOn(f.gl,'createProgram');const alloc=vi.fn(()=>{throw Error('Unexpected scratch mutation')}),target={resolveForPaint:vi.fn(),markContentPainted:vi.fn()},scratch={getOrCreate:alloc,brushCeiling:alloc,noteBrushEdgePx:()=>0}as unknown as BehaviorScratch,dab={x:8,y:8,size:8,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:0}
 const run=()=>f.painter.paint(target as never,[dab],{sizeMultiplier:1}as never,{brush:b,pressure:{size:false,opacity:false}},[1,0,0],scratch,undefined)
 try{expect(run).toThrow('program was not prepared');expect(alloc).not.toHaveBeenCalled();expect(scratch.brushBehavior).toBeUndefined();f.painter.prepareTextureLightness(b);const resource=brushPreparationResources(b).find(r=>r.patternAlpha)!;expect(f.painter.hasPreparedTexture(resource)).toBe(true);const before=[uploads.mock.calls.length,compile.mock.calls.length];f.painter.prepareTextureLightness(b);expect([uploads.mock.calls.length,compile.mock.calls.length]).toEqual(before);expect(Reflect.get(ctx,'lightnessStamp')).toBeDefined();f.painter.initGL();expect(run).toThrow('program was not prepared');expect(alloc).not.toHaveBeenCalled()}finally{f.painter.destroy();clearImportedBrushPixels()}
})
it('required foreign union rejects preflight before upload/compile without enlarging cache quota',()=>{
 const f=fixture(),cache=Reflect.get(f.painter,'textures')as import('./BrushTextureCache').BrushTextureCache,release=cache.leaseRequired([{key:'foreign-active',bytes:16*1024*1024}]),uploads=vi.spyOn(f.gl,'texImage2D'),compile=vi.spyOn(f.gl,'createProgram');try{expect(()=>f.painter.prepareTextureLightness(brush())).toThrow('budget');expect(uploads).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled()}finally{release();f.painter.destroy();clearImportedBrushPixels()}
})

it('prepared material view is retired by context epoch and cache eviction; new paint cannot borrow stale sampler',()=>{
 const f=fixture(),b=brush()
 try{
  f.painter.prepareTextureLightness(b)
  const make=Reflect.get(f.painter,'preparedTextureLightness') as (b:BrushDescriptor)=>{texture:WebGLTexture;assertCurrent:()=>void}
  const view=make.call(f.painter,b);expect(()=>view.assertCurrent()).not.toThrow()
  f.painter.initGL();expect(()=>view.assertCurrent()).toThrow('owner was retired');expect(()=>make.call(f.painter,b)).toThrow('not prepared')
 }finally{f.painter.destroy();clearImportedBrushPixels()}
})
