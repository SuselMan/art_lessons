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
 const buffer={width:64,height:64,beginReplaceDraw:vi.fn(),endDraw:vi.fn()}
 const draw=Reflect.get(painter,'drawTransferDab') as (...args:unknown[])=>void
 return{gl,painter,buffer,texture,draw}
}
function brush(mode:string,modern=false){
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
it.each(['multiply','screen'])('uses captured projected source but copies into actual layer for legacy %s',(mode)=>{
 const f=fixture(),b=brush(mode);b.version=85;b.mixer!.source='projectionCanvas'
 expect(brushPreparationPlan(b).capabilities).toEqual(expect.arrayContaining(['projectionCanvas','colorSmudgeLegacy']))
 const source={texture:f.gl.createTexture()},original={texture:f.gl.createTexture()},buffers=[original,source]
 const captured=Object.freeze([{buffer:{resolveVisible:()=>[]},opacity:1},{buffer:{resolveVisible:()=>[]},opacity:.5}])
 const projection=vi.fn(),gather=vi.fn(),release=vi.fn()
 Reflect.set(f.painter,'projectionSampler',{gather:projection,destroy:vi.fn()})
 Reflect.set(f.painter,'acquireScratch',()=>buffers.shift())
 Reflect.set(f.painter,'releaseScratch',release);Reflect.set(f.painter,'gatherPatch',gather)
 const target={resolveForPaint:()=>[{buffer:f.buffer,originX:0,originY:0}],markContentPainted:vi.fn()}
 const wet={projection:captured,stamp:{aspect:1,angle:0,edgeSoftness:0,opacityScale:1,color:[.8,.2,.6]},paint:{brush:b,strength:.5},seed:1,step:{pickup:.6},foregroundRate:.16}
 const transfer=Reflect.get(f.painter,'paintPreviousCanvas')as(...args:unknown[])=>void
 const bind=vi.spyOn(f.gl,'bindTexture'),active=vi.spyOn(f.gl,'activeTexture'),rect={minX:0,minY:0,maxX:16,maxY:16}
 transfer.call(f.painter,target,{x:10,y:10,pressure:1,opacity:1},4,rect,rect,16,16,{x:8,y:8},wet.paint,wet)
 expect(projection).toHaveBeenCalledExactlyOnceWith(source,rect,captured)
 expect(gather).toHaveBeenCalledExactlyOnceWith(original,target.resolveForPaint(),rect,16,16)
 const u=uniforms(f.painter,'colorSmudgeLegacyTransfer')
 expect(u.get('u_strength')).toBe(.3);expect(u.get('u_previousCanvasForeground')).toEqual([.8,.2,.6,.08])
 expect(u.get('u_wetOriginal')).toBe(5);expect(u.get('u_carried')).toBe(1)
 expect(bind).toHaveBeenCalledWith(f.gl.TEXTURE_2D,original.texture)
 expect(bind).toHaveBeenCalledWith(f.gl.TEXTURE_2D,source.texture)
 expect(active).toHaveBeenCalledWith(f.gl.TEXTURE0+5)
 expect(target.markContentPainted).toHaveBeenCalledOnce();expect(release).toHaveBeenCalledTimes(2)
 f.painter.destroy()
})
it('keeps projection unavailable before85 and preserves normal prior-layer legacy83',()=>{
 const f=fixture(),b=brush('multiply');b.version=83;b.mixer!.source='projectionCanvas'
 expect(()=>paint(f,b,.16)).toThrow('Legacy Color Smudge requires its own canvas strategy')
 expect(f.buffer.beginReplaceDraw).not.toHaveBeenCalled()
 b.version=84;expect(()=>paint(f,b,.16)).toThrow('Legacy Color Smudge requires its own canvas strategy')
 b.mixer!.source='previousCanvas';paint(f,b,.16)
 expect(f.buffer.beginReplaceDraw).toHaveBeenCalledOnce();f.painter.destroy()
})
it('independent premultiplied two-layer oracle keeps background projection out of the final destination',()=>{
 // Foreground native operator acts on projected background, final masked COPY
 // targets the half-opaque actual red layer, not that visible blue/red projection.
 const bottom=[0,0,.8,.8],actual=[.4,0,0,.5],projected=actual.map((v,i)=>v+bottom[i]*(1-actual[3]))
 expect(projected).toEqual([.4,0,.4,.9])
 const pigment=[.8,.2,.6],alpha=.08,amount=.6*.5*.75
 for(const mode of ['multiply','screen']){
  const mixed=projected.slice(0,3).map((v,i)=>{
   const d=v/projected[3],s=pigment[i],blend=mode==='multiply'?d*s:d+s-d*s
   return v*(1-alpha)+s*alpha*(1-projected[3])+blend*projected[3]*alpha
  });mixed.push(alpha+projected[3]*(1-alpha))
  const result=actual.map((v,i)=>v*(1-amount)+mixed[i]*amount)
  const expected=mode==='multiply'?[.4,.00036,.0882,.5918]:[.40864,.0036,.09648,.5918]
  result.forEach((v,i)=>expect(v).toBeCloseTo(expected[i],12))
  expect(projected[2]*(1-amount)+mixed[2]*amount).not.toBeCloseTo(result[2],2)
 }
})

import {brushExecutionContext} from '../presets/brushExecutionContext'
import type {ILayerBuffer} from '../buffers/ILayerBuffer'
import type {Dab} from '@grafetto/shared'
it('opens recorded projection context through public paint and closes the read session exactly once',()=>{
 const f=fixture(),b=brush('screen');b.version=85;b.mixer!.source='projectionCanvas'
 const context=brushExecutionContext(undefined,{version:1,projection:[{id:'lower',opacity:.6},{id:'active',opacity:1}]})!
 const layers=Object.freeze([{buffer:{resolveVisible:()=>[]},opacity:.6},{buffer:{resolveVisible:()=>[]},opacity:1}])
 const close=vi.fn(),open=vi.fn(()=>({layers,release:close})),ctx=Reflect.get(f.painter,'ctx')as SmudgeContext
 ctx.openProjection=open
 const received:unknown[][]=[]
 // Public ingress must forward the captured source, not current UI/layer order.
 Reflect.set(f.painter,'paintBehaviorDab',(...args:unknown[])=>{received.push(args)})
 const target={resolveForPaint:()=>[],resolveVisible:()=>[],markContentPainted:vi.fn()}as unknown as ILayerBuffer
 const d:Dab={x:10,y:10,size:8,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:0}
 const paint={brush:b,color:[.8,.2,.6]as[number,number,number],load:0,pickup:.6,strength:.5,pressure:false,sizeMultiplier:1,curve:[[0,1],[1,1]]as[number,number][]}
 f.painter.paint(target,[d], 'actor',undefined,'gesture85',paint,context)
 expect(open).toHaveBeenCalledExactlyOnceWith(context.brushSource,target)
 expect(received).toHaveLength(1);expect(received[0][5]).toBe(context);expect(received[0][6]).toBe(layers)
 expect(close).toHaveBeenCalledOnce()
 Reflect.set(f.painter,'paintBehaviorDab',()=>{throw undefined})
 let caught=false;try{f.painter.paint(target,[d],'actor',d,'gesture85',paint,context)}catch(error){caught=true;expect(error).toBeUndefined()}
 expect(caught).toBe(true);expect(close).toHaveBeenCalledTimes(2)
 f.painter.destroy()
})
