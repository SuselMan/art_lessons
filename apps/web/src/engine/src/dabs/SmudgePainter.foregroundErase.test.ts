import {expect,it,vi} from 'vitest'
import {MockGL} from '../../testing/mockGL'
import {SmudgePainter,type SmudgeContext} from './SmudgePainter'
import {digitalBrushFromPreset} from '../presets/digitalBrushPresets'
import {brushPreparationPlan} from './BrushPreparation'
function fixture(){
 const gl=new MockGL(),painter=new SmudgePainter({gl:gl as unknown as WebGLRenderingContext}as SmudgeContext)
 const texture=gl.createTexture()
 Reflect.set(painter,'ctx',{paper:{texture,worldSize:()=>({w:64,h:64}),scale:1,fillThreshold:0,fillCap:0},quadBuf:()=>gl.createBuffer()})
 painter.initGL()
 const buffer={width:64,height:64,beginReplaceDraw:vi.fn(),beginErase:vi.fn(),endDraw:vi.fn()}
 const draw=Reflect.get(painter,'drawTransferDab') as (...args:unknown[])=>void
 return{gl,painter,buffer,texture,draw}
}
function brush(mode:string,modern=true){
 const b=structuredClone(digitalBrushFromPreset('hard-round'))
 b.model='mixer';b.mixer={source:'previousCanvas',load:0,pickup:.6,strength:1,initialLoad:0,smearAlpha:true,foreground:{rate:modern ? .8 : .16},...(modern?{algorithm:'krita-mask' as const}:{})}
 Reflect.set(b.mixer,'colorRateComposite',mode)
 b.behavior={...b.behavior,version:2,rendering:{mode:'buildUp',blendMode:'normal',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}
 return b
}
function paint(f:ReturnType<typeof fixture>,b:ReturnType<typeof brush>,rate:number){
 const wet={stamp:{aspect:1,angle:0,edgeSoftness:0,opacityScale:1,color:[.2,.5,.8]},paint:{brush:b,strength:.5},seed:1,step:{pickup:.6},foregroundRate:rate}
 f.draw.call(f.painter,{buffer:f.buffer,originX:0,originY:0},{x:10,y:10,pressure:1,opacity:1},4,{texture:f.texture},0,0,16,'lay',1,wet,{texture:f.texture})
}
function uniforms(p:SmudgePainter,name:string){
 return(Reflect.get(p,name)as{program:{uniforms:Map<string,unknown>}}).program.uniforms
}
it.each([false,true])('uses foreground erase inside existing canvas program without final target erase, modern=%s',(modern)=>{
 const f=fixture(),b=brush('erase',modern);b.version=88;b.behavior!.erase=true
 expect(brushPreparationPlan(b).capabilities).toContain(modern?'colorSmudgeForeground':'colorSmudgeLegacy')
 const prepare=modern?()=>f.painter.prepareColorSmudgeForeground():()=>f.painter.prepareColorSmudgeLegacy()
 prepare();const compile=vi.spyOn(f.gl,'createProgram')
 paint(f,b,modern ? .8 : .16)
 const u=uniforms(f.painter,modern?'colorSmudgeForegroundTransfer':'colorSmudgeLegacyTransfer')
 expect(u.get('u_colorSmudgeComposite')).toBe(6)
 expect(u.get('u_previousCanvasForeground')).toEqual([.2,.5,.8,modern ? .32000000000000006 : .08])
 expect(u.get('u_previousCanvas')).toBe(1)
 expect(f.buffer.beginReplaceDraw).toHaveBeenCalledOnce();expect(f.buffer.beginErase).not.toHaveBeenCalled()
 paint(f,b,0);expect(u.get('u_previousCanvasForeground')).toEqual([.2,.5,.8,0])
 expect(compile).not.toHaveBeenCalled();f.painter.destroy()
})
it('rejects unavailable erase version or UI classification mismatch before framebuffer mutation',()=>{
 const f=fixture(),b=brush('erase');b.version=87;b.behavior!.erase=true
 expect(()=>paint(f,b,.8)).toThrow('Foreground erase requires Color Smudge88')
 expect(f.buffer.beginReplaceDraw).not.toHaveBeenCalled()
 b.version=88;b.behavior!.erase=false
 expect(()=>paint(f,b,.8)).toThrow('Foreground erase requires Color Smudge88')
 expect(f.buffer.beginReplaceDraw).not.toHaveBeenCalled();f.painter.destroy()
})

import {brushRole}from'../../../lib/tools/brushCatalog'
import {digitalBrushMixer,digitalBrushPreset}from'../presets/digitalBrushPresets'
import {brushDefinitionForTool}from'../presets/brushDefinitions'
import {installBrushLibrary}from'../presets/importedBrushes'
import {isBrushLibrary}from'@grafetto/shared'
import {createTestEngine,dab,makeLayerAdd,makeStroke,paperReady}from'../../testing/engineTestUtils'
it('keeps an imported eraser UI role but records digital mixer and routes actual replay through public SmudgePainter',async()=>{
 const b=brush('erase');b.id='imported-eeeeeeeeeeeeeeeeeeeeee88';b.version=88;b.behavior!.erase=true;b.mixer!.foreground={rate:0}
 b.tip={kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'};delete b.texture
 const library={schemaVersion:1 as const,assets:[],skipped:[],brushes:[{name:'Authored Color Smudge Erase',source:'qa.kpp',warnings:[],descriptor:b}]}
 expect(isBrushLibrary(library)).toBe(true);installBrushLibrary(library)
 expect(brushRole(b)).toBe('eraser')
 const token=digitalBrushPreset(b.id,88)
 expect(digitalBrushMixer(token,[.8,.2,.6])?.brush?.mixer?.colorRateComposite).toBe('erase')
 const definition=brushDefinitionForTool('digitalBrush',token)
 expect(definition.model).toBe('digital')
 if(definition.model!=='digital')throw Error('wrong actual recorded model')
 expect(definition.parameters.brush.model).toBe('mixer');expect(definition.parameters.brush.behavior?.erase).toBe(true)
 const{engine}=createTestEngine({}, {width:64,height:64})
 try{
  await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
  const smudge=Reflect.get(engine,'_smudge')as SmudgePainter
  const strokes=vi.spyOn(smudge,'paint'),ordinary=vi.spyOn(Reflect.get(engine,'_stamps')as{paint:(...args:unknown[])=>void},'paint')
  engine.appendOperation(makeStroke('peer','ink',[dab(10,20,{size:8}),dab(20,20,{size:8})],{tool:'digitalBrush',preset:token,strokeId:'erase88',strokeEnd:true}),'remote')
  expect(strokes).toHaveBeenCalled();expect(ordinary).not.toHaveBeenCalled()
  for(const call of strokes.mock.calls){expect(call[5]?.brush?.mixer?.colorRateComposite).toBe('erase');expect(call[5]?.brush?.model).toBe('mixer')}
 }finally{engine.destroy()}
})
