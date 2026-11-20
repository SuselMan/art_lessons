import{it,expect,vi}from'vitest'
import type{BrushDescriptor,Dab}from'@grafetto/shared'
import{PencilEngine}from'./index'
import{BrushPainter,type BrushContext}from'./src/dabs/BrushPainter'
import{brushPreparationResources}from'./src/dabs/BrushPreparation'
import{MockGL}from'./testing/mockGL'
import{installBrushPixels}from'./src/presets/importedBrushes'
import{digitalBrushFromPreset}from'./src/presets/digitalBrushPresets'
import type{BehaviorScratch}from'./src/dabs/BrushBehaviorPainter'
const id=`asset:${'e'.repeat(64)}`as const
function definition():BrushDescriptor{const part=():BrushDescriptor=>({...digitalBrushFromPreset('hard-round'),version:122,scatter:undefined,tip:{kind:'bitmap',mask:id,hardness:1,aspect:1,angle:0,rotation:'fixed'},sizeByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],behavior:{version:2,strokeInput:{version:1,initialDirection:'cursorHistory'},rotation:{follow:1,random:'none'},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}});const root=part(),child=part();child.tip.imageSampling={kind:'integer-pyramid',signal:'inverse-gray',sourceRect:{x:0,y:1,width:4,height:2}};child.behavior!.rendering!.accumulation='alphaDarken';root.behavior!.dual={brush:child,sampling:'independent',blendMode:'multiply'};return root}
const point:Dab={x:-2,y:-3,size:4,pressure:1,opacity:1,angle:0,sourceAngle:Math.PI/2,aspectRatio:1,tiltX:0,tiltY:0,t:0}
function owner(){installBrushPixels(id,new Uint8Array([0,0,0,0,255,0,0,0,128,0,0,0,0,0,0,0]));const gl=Object.assign(new MockGL(),{blendColor:vi.fn()}),painter=new BrushPainter({gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext);painter.initGL();return{gl,painter}}
function dispatch(painter:BrushPainter,brush:BrushDescriptor,scratch:BehaviorScratch){return Reflect.apply(PencilEngine.prototype['_paintBrushStroke'],{_brush:painter},[{resolveForPaint:()=>{throw Error('unexpected target')},markContentPainted:()=>{}},[point],{sizeMultiplier:1},{brush,pressure:{size:true,opacity:true}},[1,0,0],scratch,undefined,undefined])}
function scratch(){return{getOrCreate:vi.fn(()=>{throw Error('unexpected scratch')}),brushSecondary:vi.fn(()=>{throw Error('ready child boundary')})}as unknown as BehaviorScratch}
it('actual prototype recorded dispatch warms never-selected bank before actual Painter state; warm/context-cold repeats stay correct',()=>{
 const{gl,painter}=owner(),brush=definition();try{const resources=brushPreparationResources(brush);expect(resources.some(r=>!painter.hasPreparedTexture(r))).toBe(true);const s=scratch();expect(()=>dispatch(painter,brush,s)).toThrow('ready child boundary');expect(s.brushBehavior).toBeDefined();expect(resources.every(r=>painter.hasPreparedTexture(r))).toBe(true);const upload=vi.spyOn(gl,'texImage2D'),compile=vi.spyOn(gl,'createProgram');expect(()=>dispatch(painter,brush,scratch())).toThrow('ready child boundary');expect(upload).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled();upload.mockRestore();compile.mockRestore();painter.initGL();expect(resources.some(r=>!painter.hasPreparedTexture(r))).toBe(true);expect(()=>dispatch(painter,brush,scratch())).toThrow('ready child boundary');expect(resources.every(r=>painter.hasPreparedTexture(r))).toBe(true)}finally{painter.destroy()}
})
it('actual prototype refuses source bounds before root/child state or any derivative upload',()=>{
 const{gl,painter}=owner(),brush=definition();try{brush.behavior!.dual!.brush.tip.imageSampling!.sourceRect.x=1;const s=scratch(),upload=vi.spyOn(gl,'texImage2D');expect(()=>dispatch(painter,brush,s)).toThrow('rectangle exceeds');expect(s.brushBehavior).toBeUndefined();expect(s.getOrCreate).not.toHaveBeenCalled();expect(s.brushSecondary).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();upload.mockRestore()}finally{painter.destroy()}
})
