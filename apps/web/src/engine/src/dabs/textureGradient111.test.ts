import{it,expect,vi}from'vitest'
import{isBrushLibrary,brushUsesGradient,makeBrushGradient,copyBrushSourceContext,brushSourceKey,type BrushDescriptor,type BrushLibrary}from'@grafetto/shared'
import{textureMaterialVariant,usesTextureLightness,usesTextureGradient}from'../presets/textureLightness'
import{assertBrushExecutionContext,type BrushExecutionContext}from'../presets/brushExecutionContext'
import{BrushPainter,type BrushContext}from'./BrushPainter'
import{brushPreparationResources,bindBrushGradient,brushTextureResourceKey,brushPreparationBytes}from'./BrushPreparation'
import{createBrushStampFragment}from'../raster/brushBehaviorShaders'
import{installBrushPixels,clearImportedBrushPixels}from'../presets/importedBrushes'
import{MockGL}from'../../testing/mockGL'
const mask=`asset:${'a'.repeat(64)}`as const,gray=`asset:${'b'.repeat(64)}`as const,alpha=`asset:${'c'.repeat(64)}`as const
function descriptor():BrushDescriptor{return{id:'imported-111111111111111111111111',version:111,model:'stamp',category:'paint',tip:{kind:'bitmap',mask,hardness:1,aspect:1,angle:0,rotation:'fixed'},texture:{id:gray,material:{kind:'gradient',alpha},strength:.5,periodPx:4,patternSize:{width:4,height:4}},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}}
function library(d=descriptor()):BrushLibrary{return{schemaVersion:1,skipped:[],assets:[mask,gray,alpha].map(id=>({id,size:4,file:id.slice(6)+'.bin'})),brushes:[{name:'Authored Texture Gradient111',source:'authored111.kpp',warnings:[],descriptor:d}]}}
const paletteA=makeBrushGradient([1,0,0,.25],[0,0,1,1]),paletteB=makeBrushGradient([0,1,0,1],[1,1,0,0])
function execution(gradient=paletteA):BrushExecutionContext{return{brushSource:copyBrushSourceContext({version:1,gradient})}}
function setup(){installBrushPixels(mask,new Uint8Array(16).fill(128));installBrushPixels(gray,new Uint8Array(16).fill(127));installBrushPixels(alpha,new Uint8Array(16).fill(64));const gl=new MockGL(),white=gl.createTexture(),quad=gl.createBuffer(),painter=new BrushPainter({gl:gl as unknown as WebGLRenderingContext,quadBuf:()=>quad,screenBuf:()=>quad,paper:{texture:white,scale:1,worldSize:()=>({w:64,h:64})}}as unknown as BrushContext);painter.initGL();return{gl,painter}}
it('111 material alone activates captured source, closes historical/profile/secondary combinations and preserves108 selection',()=>{
 const d=descriptor();expect(isBrushLibrary(library(d))).toBe(true);expect(brushUsesGradient(d)).toBe(true);expect(textureMaterialVariant(d)).toBe('gradient');expect(usesTextureGradient(d)).toBe(true);expect(usesTextureLightness(d)).toBe(false)
 const old=descriptor();old.version=108;if(!old.texture?.material)throw Error('fixture material');old.texture.material.kind='lightness';expect(isBrushLibrary(library(old))).toBe(true);expect(brushUsesGradient(old)).toBe(false);expect(textureMaterialVariant(old)).toBe(true)
 for(const mutate of[(b:BrushDescriptor)=>{b.version=110},(b:BrushDescriptor)=>{b.tip.color={planes:[mask,mask,mask]}},(b:BrushDescriptor)=>{b.behavior={...b.behavior,version:2,dual:{brush:old,blendMode:'normal'}}},(b:BrushDescriptor)=>{b.model='mixer'},(b:BrushDescriptor)=>{if(!b.texture)throw Error('fixture');b.texture.application={mode:'subtract',soft:false}}]){const bad=descriptor();mutate(bad);expect(isBrushLibrary(library(bad))).toBe(false);expect(()=>textureMaterialVariant(bad)).toThrow()}
})
it('palette capture is immutable, nonce-keyed and required before state; it never comes from receiver colour',()=>{
 const d=descriptor();expect(()=>assertBrushExecutionContext(d)).toThrow('captured canvas gradient');const a=execution(),b=execution(paletteB);if(!a.brushSource||!b.brushSource)throw Error('fixture source');expect(()=>assertBrushExecutionContext(d,a)).not.toThrow();expect(brushSourceKey(a.brushSource)).not.toBe(brushSourceKey(b.brushSource));expect(Object.isFrozen(a.brushSource)).toBe(true);expect(a.brushSource?.gradient).toBe(paletteA)
})
it('bound plans share one108 packing key, reuse100 palette content key, account1024bytes and reject unbound palette',()=>{
 const plan=brushPreparationResources(descriptor());expect(()=>bindBrushGradient(plan,undefined)).toThrow('captured palette');const a=bindBrushGradient(plan,paletteA),b=bindBrushGradient(plan,paletteB),pattern=a.find(r=>r.patternAlpha),other=b.find(r=>r.patternAlpha),palette=a.find(r=>r.gradientPalette),otherPalette=b.find(r=>r.gradientPalette);if(!pattern||!other||!palette||!otherPalette)throw Error('missing resource plan')
 expect(brushTextureResourceKey(pattern)).toBe(brushTextureResourceKey(other));expect(brushTextureResourceKey(palette)).not.toBe(brushTextureResourceKey(otherPalette));expect(brushTextureResourceKey(palette)).toBe(brushTextureResourceKey({id:mask,grain:false,gradientPalette:true,gradientLut:paletteA}));expect(brushPreparationBytes([palette],()=>4)).toBe(1024)
})
it('actual preflight compiles/uploads once, requires source before any GL creation and retires BOTH views on context loss',()=>{
 const f=setup(),d=descriptor(),upload=vi.spyOn(f.gl,'texImage2D'),compile=vi.spyOn(f.gl,'createProgram')
 try{expect(()=>f.painter.prepareTextureGradient(d)).toThrow('captured canvas gradient');expect(upload).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled();f.painter.prepareTextureGradient(d,execution());const before=[upload.mock.calls.length,compile.mock.calls.length];f.painter.prepareTextureGradient(d,execution());expect([upload.mock.calls.length,compile.mock.calls.length]).toEqual(before)
  const getView=Reflect.get(f.painter,'preparedTextureLightness')as(b:BrushDescriptor,lut:string)=>{texture:WebGLTexture;palette?:{texture:WebGLTexture;assertCurrent:()=>void};assertCurrent:()=>void};const view=getView.call(f.painter,d,paletteA);if(!view.palette)throw Error('missing prepared palette');expect(view.texture).not.toBe(view.palette.texture);expect(()=>view.assertCurrent()).not.toThrow();expect(()=>getView.call(f.painter,d,paletteB)).toThrow('palette was not prepared');f.painter.initGL();expect(()=>view.assertCurrent()).toThrow('retired');expect(()=>view.palette?.assertCurrent()).toThrow('retired')
 }finally{f.painter.destroy();clearImportedBrushPixels()}
})
it('strict full cache union rejects before shader/upload, and no selected palette fallback is accepted',()=>{
 const f=setup(),cache=Reflect.get(f.painter,'textures')as import('./BrushTextureCache').BrushTextureCache,release=cache.leaseRequired([{key:'foreign-active',bytes:16*1024*1024}]),upload=vi.spyOn(f.gl,'texImage2D'),compile=vi.spyOn(f.gl,'createProgram');try{expect(()=>f.painter.prepareTextureGradient(descriptor(),execution())).toThrow('budget');expect(upload).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled()}finally{release();f.painter.destroy();clearImportedBrushPixels()}
})
it('actual derived shader filters pattern BEFORE byte-index palette and alpha-weighted mix, with explicit unit6 capability',()=>{
 const next=createBrushStampFragment(true,true,true,true,false,false,true),old108=createBrushStampFragment(true,true,true,true,false,true);expect(old108).not.toContain('uniform sampler2D u_gradientPalette');expect(next).toContain('float w=floor(clamp(u_texStrength,0.0,1.0)*255.0+0.5)/255.0;');expect(next.indexOf('vec4 pattern=brushTextureGridRgba')).toBeLessThan(next.indexOf('vec4 palette=texture2D(u_gradientPalette'));expect(next).toContain('mappedAlpha=min(palette.a*pattern.a,sourceAlpha)');expect(next).toContain('pigment*sourceAlpha*(1.0-w)+palette.rgb*mappedAlpha*w');expect(next.indexOf('shape=mixedAlpha;')).toBeLessThan(next.indexOf('float amount = shape * v_opacity;'));expect(()=>createBrushStampFragment(true,true,true,true,true,false,true)).toThrow();expect(()=>createBrushStampFragment(true,true,true,true,false,true,true)).toThrow()
})
// Independent integer specification, not a second production implementation.
function witness(d:readonly number[],g:readonly number[],patternA:number,w:number):number[]{const round=(n:bigint,v:bigint)=>(n+v/2n)/v,da=BigInt(d[3]),pa=round(BigInt(g[3])*BigInt(patternA),255n),a=pa<da?pa:da,x=a*BigInt(w),y=da*BigInt(255-w),total=x+y;if(!total)return[0,0,0,0];return[0,1,2].map(c=>Number(round(BigInt(g[c])*x+BigInt(d[c])*y,total))).concat(Number(round(total,255n)))}
it('independent BigInt premultiplied weighting proves non-lerp result, no-resurrection, strength0 identity and alpha bound',()=>{
 expect(witness([255,0,0,128],[0,0,255,255],64,128)).toEqual([170,0,85,96]);expect(witness([255,0,0,128],[0,0,255,0],64,0)).toEqual([255,0,0,128]);expect(witness([255,0,0,0],[0,0,255,255],255,128)).toEqual([0,0,0,0]);expect(witness([255,0,0,128],[0,0,255,0],255,255)).toEqual([0,0,0,0]);for(const da of[0,1,64,128,255])for(const pa of[0,1,64,128,255])for(const w of[0,1,127,128,254,255])expect(witness([255,0,0,da],[0,0,255,255],pa,w)[3]).toBeLessThanOrEqual(da)
})
it('actual paint rejects missing source/program/resource before bindings or gesture/scratch mutation',()=>{
 const f=setup(),b=descriptor(),allocate=vi.fn(()=>{throw Error('Unexpected paint allocation')}),scratch={getOrCreate:allocate,brushCeiling:allocate,noteBrushEdgePx:()=>0}as unknown as import('./BrushBehaviorPainter').BehaviorScratch,target={resolveForPaint:allocate,markContentPainted:allocate}as unknown as Parameters<BrushPainter['paint']>[0],preset={sizeMultiplier:1}as Parameters<BrushPainter['paint']>[2],dab={x:8,y:8,size:8,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:0}
 const paint=(context?:BrushExecutionContext)=>f.painter.paint(target,[dab],preset,{brush:b,pressure:{size:false,opacity:false}},[1,0,0],scratch,undefined,context)
 try{expect(()=>paint()).toThrow('captured canvas gradient');expect(()=>paint(execution())).toThrow('program was not prepared');f.painter.prepareTextureGradient(b,execution());const cache=Reflect.get(f.painter,'textures')as import('./BrushTextureCache').BrushTextureCache;cache.clear(true);expect(()=>paint(execution())).toThrow('not prepared');expect(allocate).not.toHaveBeenCalled();expect(scratch.brushBehavior).toBeUndefined()}finally{f.painter.destroy();clearImportedBrushPixels()}
})

it('evicting ONLY prepared mask fails before lazy upload or scratch mutation while palette and pattern remain resident',()=>{
 const f=setup(),b=descriptor(),allocate=vi.fn(()=>{throw Error('Unexpected scratch mutation')}),scratch={getOrCreate:allocate,brushCeiling:allocate,noteBrushEdgePx:()=>0}as unknown as import('./BrushBehaviorPainter').BehaviorScratch,target={resolveForPaint:allocate,markContentPainted:allocate}as unknown as Parameters<BrushPainter['paint']>[0],preset={sizeMultiplier:1}as Parameters<BrushPainter['paint']>[2],dab={x:8,y:8,size:8,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:0}
 try{
  f.painter.prepareTextureGradient(b,execution())
  const resources=bindBrushGradient(brushPreparationResources(b),paletteA),maskResource=resources.find(v=>v.id===mask&&!v.grain&&!v.gradientPalette),pattern=resources.find(v=>v.patternAlpha),palette=resources.find(v=>v.gradientPalette)
  if(!maskResource||!pattern||!palette)throw Error('Fixture resource inventory')
  const cache=Reflect.get(f.painter,'textures')as import('./BrushTextureCache').BrushTextureCache
  expect(f.painter.hasPreparedTexture(maskResource)).toBe(true);cache.remove(brushTextureResourceKey(maskResource));expect(f.painter.hasPreparedTexture(maskResource)).toBe(false);expect(f.painter.hasPreparedTexture(pattern)).toBe(true);expect(f.painter.hasPreparedTexture(palette)).toBe(true)
  const upload=vi.spyOn(f.gl,'texImage2D'),compile=vi.spyOn(f.gl,'createProgram')
  expect(()=>f.painter.paint(target,[dab],preset,{brush:b,pressure:{size:false,opacity:false}},[1,0,0],scratch,undefined,execution())).toThrow('resource was not prepared')
  expect(upload).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled();expect(allocate).not.toHaveBeenCalled();expect(scratch.brushBehavior).toBeUndefined()
 }finally{f.painter.destroy();clearImportedBrushPixels()}
})
