import{it,expect,vi}from'vitest'
import{makeBrushGradient,type BrushDescriptor}from'@grafetto/shared'
import{gradient138,alpha138,gray138}from'../../../../../../packages/shared/src/pixelGradientWash138.testFixture'
import{BrushPainter,type BrushContext}from'./BrushPainter'
import{BrushBehaviorPainter,type BehaviorScratch}from'./BrushBehaviorPainter'
import{MockGL}from'../../testing/mockGL'
import{installBrushPixels,clearImportedBrushPixels}from'../presets/importedBrushes'
import{brushExecutionContext}from'../presets/brushExecutionContext'
import{brushPreparationResources,bindBrushGradient,brushTextureResourceKey}from'./BrushPreparation'
import type{ILayerBuffer}from'../buffers/ILayerBuffer'
import type{PencilPreset}from'../presets/pencilPresets'
const paletteA=makeBrushGradient([1,0,0,1],[0,0,1,0]),paletteB=makeBrushGradient([0,1,0,1],[1,1,1,1])
const execution=(gradient=paletteA)=>brushExecutionContext(undefined,{version:1,gradient})
const dab={x:-23,y:17,size:12,pressure:.5,opacity:.5,angle:.3,aspectRatio:1,tiltX:0,tiltY:0,t:0}
function owner(){installBrushPixels(alpha138,new Uint8Array([255,128,0,64,255,128,0,64,255,128,0,64,255,128,0,64]));installBrushPixels(gray138,new Uint8Array([0,87,127,255,255,127,87,0,0,87,127,255,255,127,87,0]));const gl=Object.assign(new MockGL(),{blendColor:vi.fn()}),painter=new BrushPainter({gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext);painter.initGL();return{gl,painter}}
const scratch=()=>({getOrCreate:vi.fn(()=>{throw Error('scratch forbidden')})}as unknown as BehaviorScratch)
function paint(p:BrushPainter,b:BrushDescriptor,s:BehaviorScratch,...contexts:[context?:ReturnType<typeof execution>]){const context=contexts.length?contexts[0]:execution();return p.paint({resolveForPaint(){throw Error('ready target boundary')},markContentPainted(){}}as unknown as ILayerBuffer,[dab],{sizeMultiplier:1}as PencilPreset,{brush:b,pressure:{size:true,opacity:true}},[0,1,0],s,undefined,context)}
it('public Painter requires captured palette and realprepared100 resources; wrongboundpalette never falls back',()=>{
 const{gl,painter}=owner(),b=gradient138(),upload=vi.spyOn(gl,'texImage2D'),compile=vi.spyOn(gl,'createProgram')
 try{
  painter.prepareRecordedStampResources(b);expect(upload).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled()
  expect(()=>painter.preparePixelGradient(b)).toThrow('captured');expect(upload).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled()
  const unbound=scratch();expect(()=>paint(painter,b,unbound,undefined)).toThrow();expect(unbound.brushBehavior).toBeUndefined();expect(unbound.getOrCreate).not.toHaveBeenCalled()
  painter.preparePixelGradient(b,execution());const missing=scratch();expect(()=>paint(painter,b,missing,execution(paletteB))).toThrow('not prepared');expect(missing.brushBehavior).toBeUndefined();expect(missing.getOrCreate).not.toHaveBeenCalled()
  const before=[upload.mock.calls.length,compile.mock.calls.length];painter.preparePixelGradient(b,execution());expect([upload.mock.calls.length,compile.mock.calls.length]).toEqual(before)
  expect(()=>paint(painter,b,scratch())).toThrow('ready target boundary')
  painter.preparePixelGradient(b,execution(paletteB));expect(()=>paint(painter,b,scratch(),execution(paletteB))).toThrow('ready target boundary')
 }finally{painter.destroy();clearImportedBrushPixels()}
})
it('evictedmask or palette and retiredcontext fail before scratch/state/upload/compile',()=>{
 const{gl,painter}=owner(),b=gradient138()
 try{
  painter.preparePixelGradient(b,execution());const resources=bindBrushGradient(brushPreparationResources(b),paletteA)
  for(const resource of[resources.find(r=>r.gradientSource)!,resources.find(r=>r.gradientPalette)!]){
   painter['textures'].remove(brushTextureResourceKey(resource));const s=scratch(),upload=vi.spyOn(gl,'texImage2D'),compile=vi.spyOn(gl,'createProgram')
   expect(()=>paint(painter,b,s)).toThrow('not prepared');expect(s.brushBehavior).toBeUndefined();expect(s.getOrCreate).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled();upload.mockRestore();compile.mockRestore();painter.preparePixelGradient(b,execution())
  }
  Reflect.set(painter['behavior'],'gradientStamp',undefined);const programOnly=scratch(),upload=vi.spyOn(gl,'texImage2D'),compile=vi.spyOn(gl,'createProgram')
  expect(()=>paint(painter,b,programOnly)).toThrow('program was not prepared');expect(programOnly.brushBehavior).toBeUndefined();expect(programOnly.getOrCreate).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled();upload.mockRestore();compile.mockRestore();painter.preparePixelGradient(b,execution())
  painter.initGL();const s=scratch();expect(()=>paint(painter,b,s)).toThrow();expect(s.brushBehavior).toBeUndefined();expect(s.getOrCreate).not.toHaveBeenCalled()
 }finally{painter.destroy();clearImportedBrushPixels()}
})
it('full existing16MiB strict union is admitted before programs or uploads',()=>{
 const{gl,painter}=owner(),b=gradient138();const hold=painter['textures'].leaseRequired([{key:'own-foreign-full',bytes:16*1024*1024}]);const upload=vi.spyOn(gl,'texImage2D'),compile=vi.spyOn(gl,'createProgram')
 try{expect(()=>painter.preparePixelGradient(b,execution())).toThrow('budget');expect(upload).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled()}finally{hold();painter.destroy();clearImportedBrushPixels()}
})
it('actual BBP rejects malformed138 and effectiveerase before context, scratch, target or lease access',()=>{
 const p=Object.create(BrushBehaviorPainter.prototype)as BrushBehaviorPainter,touch=vi.fn();Object.defineProperty(p,'ctx',{get(){touch();throw Error('context')}})
 const target=new Proxy({},{get(){touch();throw Error('target')}})as ILayerBuffer,s=new Proxy({},{get(){touch();throw Error('scratch')}})as BehaviorScratch
 for(const edit of[(b:BrushDescriptor)=>{b.version=137},(b:BrushDescriptor)=>{b.behavior!.erase=true},(b:BrushDescriptor)=>{Reflect.set(b,'texture',{})},(b:BrushDescriptor)=>{if(b.tip.color&&'gradient'in b.tip.color)delete b.tip.color.gradient.sampling}]){const b=gradient138();edit(b);expect(()=>p.paint(target,[dab],{sizeMultiplier:1}as PencilPreset,b,{size:true,opacity:true},[1,0,0],s)).toThrow('Wash138');expect(touch).not.toHaveBeenCalled()}
 expect(()=>p.paint(target,[dab],{sizeMultiplier:1}as PencilPreset,gradient138(),{size:true,opacity:true},[1,0,0],s,false,undefined,execution(),true)).toThrow('Wash138');expect(touch).not.toHaveBeenCalled()
})

it('legacy mixer gradient/Wash reaches its existing context boundary instead of the new Pixel138 guard',()=>{
 const p=Object.create(BrushBehaviorPainter.prototype)as BrushBehaviorPainter,touch=vi.fn(()=>{throw Error('legacy mixer context boundary')});Object.defineProperty(p,'ctx',{get:touch})
 const b=gradient138();b.version=100;b.model='mixer';b.category='wet';b.mixer={load:.3,initialLoad:.3,pickup:.6,strength:1,source:'previousCanvas'}
 expect(()=>p.paint({}as ILayerBuffer,[dab],{sizeMultiplier:1}as PencilPreset,b,{size:true,opacity:true},[1,0,0],{}as BehaviorScratch,false,undefined,execution())).toThrow('legacy mixer context boundary')
 expect(touch).toHaveBeenCalledOnce()
})
