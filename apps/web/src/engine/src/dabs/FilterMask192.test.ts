import {expect,it,vi} from 'vitest'
import {filter192,FILTER192_MASK,FILTER192_FRAME,FILTER192_TEXTURE} from '../../../../../../packages/shared/src/filterMask192.testFixture'
import {filter147} from '../../../../../../packages/shared/src/filterSmudge147.testFixture'
import {BRUSH_BLEND_MODES} from '@grafetto/shared'
import {brushPreparationPlan} from './BrushPreparation'
import {filterSourceOver192,filterComposite192Code,FILTER_COMPOSITE192_GLSL} from './filterComposite192'
import {mask190RootExecution} from '../presets/independentMask190'
import {assertBrushSourceInputs} from '../presets/brushExecutionContext'
import {installBrushPixels} from '../presets/importedBrushes'
import {BrushPainter,type BrushContext} from './BrushPainter'
import {MockGL} from '../../testing/mockGL'
import {FilterSmudge147Pass} from './FilterSmudge147'
import {FilterGaussian153Pass} from './FilterGaussian153'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
const dab={x:20,y:20,size:4,pressure:1,opacity:.5,angle:0,sourceSize:Math.fround(16.3),sourceScale:1,sourceAngle:Math.PI/2,sourceTwist:180,sourceTangentialPressure:.5,aspectRatio:1,tiltX:0,tiltY:0,t:0}
it.each(['invert','desaturate','posterize','gaussian','unsharp'] as const)('both native %s source policies use the same root execution and five captured inputs',kind=>{
 for(const smudge of[false,true]){const b=filter192(kind,smudge),execution=mask190RootExecution(b);expect(execution?.maskRole190?.version).toBe(192);expect(filterSourceOver192(b)).toBe(smudge?1:0);expect(()=>assertBrushSourceInputs(b,[dab],undefined,execution)).not.toThrow();expect(()=>assertBrushSourceInputs(b,[{...dab,sourceTwist:undefined}],undefined,execution)).toThrow();expect(brushPreparationPlan(b).resources.every(r=>r.painter==='stamp')).toBe(true)}
 expect(filterSourceOver192(filter147())).toBe(1)
})
it('all destination modes retain distinct full-bank codes; legacy and192 COPY remain fixed selection',()=>{
 const b=filter192();expect(filterComposite192Code(b)).toBe(-1);expect(filterComposite192Code(filter147())).toBe(-1)
 for(const mode of[...BRUSH_BLEND_MODES,'erase']as const){b.filter={...b.filter!,composite:mode} as typeof b.filter;expect(filterComposite192Code(b)).toBe(mode==='erase'?-2:BRUSH_BLEND_MODES.indexOf(mode))}
 expect(FILTER_COMPOSITE192_GLSL).toContain('brushKritaHardMix');expect(FILTER_COMPOSITE192_GLSL).toContain('mode>25.5')
})
it('cold unselected native bitmap192 prepares stamp union without descriptor proxy, then warm readiness performs no uploads/compile',()=>{
 const b=filter192();b.tip={kind:'bitmap',mask:FILTER192_MASK,hardness:1,aspect:1,angle:0,rotation:'fixed',animation:{mode:'incremental',frames:[FILTER192_MASK,FILTER192_FRAME]}}
 installBrushPixels(FILTER192_MASK,new Uint8Array(16).fill(64));installBrushPixels(FILTER192_FRAME,new Uint8Array(16).fill(191));installBrushPixels(FILTER192_TEXTURE,new Uint8Array(16).fill(128));b.texture={id:FILTER192_TEXTURE,strength:.75,periodPx:4,application:{mode:'colorDodge',soft:false},patternSize:{width:4,height:4}}
 const gl=Object.assign(new MockGL(),{blendColor:vi.fn()}),p=new BrushPainter({gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1} as unknown as BrushContext)
 p.initGL();try{const plan=brushPreparationPlan(b);expect(plan.resources.every(r=>r.painter==='stamp')).toBe(true);expect(plan.resources.some(r=>r.id===FILTER192_FRAME)).toBe(true);p.prepareFilterSmudge147(b);const compile=vi.spyOn(gl,'createProgram'),upload=vi.spyOn(gl,'texImage2D');p.prepareFilterSmudge147(b);expect(compile).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled()}finally{p.destroy()}
})
const buffer=(width=8,height=8)=>({width,height,texture:{},beginReplaceDraw:vi.fn(),endDraw:vi.fn(),copyRegionInto:vi.fn()} as unknown as AccumulationBuffer)
it.each([false,true])('actual pointwise request passes SOURCE coefficient and destination mode before drawing (%s)',smudge=>{
 const b=filter192('invert',smudge);b.filter={...b.filter!,composite:'multiply'}as typeof b.filter
 const gl=new MockGL(),pass=new FilterSmudge147Pass(gl as unknown as WebGLRenderingContext);pass.prepare(b)
 const working=buffer(),next=buffer(),previous=buffer(),destination=buffer(),mask=buffer(),tile={buffer:destination,originX:0,originY:0,contentRect:null},state={source:{resolveForRead:()=>[]}},request={assertCurrent:vi.fn(),working:{buffer:working},next:{buffer:next},temporary:()=>previous}
 Object.assign(Reflect.get(pass,'sampler'),{gather:vi.fn()});const uniform=vi.spyOn(gl,'uniform1f');pass.paint(b,state as never,request as never,tile,{minX:1,minY:1,maxX:3,maxY:3},mask,1)
 expect(uniform.mock.calls.some(([loc,v])=>loc?.name==='u_sourceOver'&&v===(smudge?1:0))).toBe(true);expect(uniform.mock.calls.some(([loc,v])=>loc?.name==='u_filterComposite'&&v===BRUSH_BLEND_MODES.indexOf('multiply'))).toBe(true);pass.destroy()
})
it.each([false,true])('spatial request preserves oldT outside update while selecting SOURCE coefficient (%s)',smudge=>{
 const b=filter192('gaussian',smudge),gl=Object.assign(new MockGL(),{uniform1fv:vi.fn()}),pass=new FilterGaussian153Pass(gl as unknown as WebGLRenderingContext);pass.prepare();Object.assign(Reflect.get(pass,'sampler'),{gather:vi.fn()})
 const stages=[buffer(),buffer(),buffer(),buffer()],temporary={buffer:buffer(),originX:0,originY:0},request={assertCurrent:vi.fn(),stages:stages.map(buffer=>({buffer})),temporaryTiles:()=>[temporary],spatial:{side:8,needed:{minX:0,minY:0,maxX:8,maxY:8},update:{minX:2,minY:2,maxX:6,maxY:6},bounds:{minX:3,minY:3,maxX:5,maxY:5},destinations:[]}},state={source:{resolveForRead:()=>[]}}
 const uniform=vi.spyOn(gl,'uniform1f');pass.paint(b,state as never,request as never);expect(uniform.mock.calls.some(([loc,v])=>loc?.name==='u_sourceOver'&&v===(smudge?1:0))).toBe(true)
 // Actual publish writes U over update only, then F(U) over dabRect.
 expect(stages[2].copyRegionInto).toHaveBeenCalledWith(temporary.buffer,2,2,2,2,4,4);expect(stages[0].copyRegionInto).toHaveBeenCalledWith(temporary.buffer,3,3,3,3,2,2);pass.destroy()
})
it('actual canonical request budgets selected unequal frame extent, not reference ellipse, before any draw',async()=>{
 const {BrushBehaviorPainter}=await import('./BrushBehaviorPainter'),b=filter192('unsharp',false)
 b.tip={kind:'bitmap',mask:FILTER192_MASK,hardness:1,aspect:1,angle:0,rotation:'fixed',maskBounds:{x:0,y:0,width:1,height:1},animation:{mode:'incremental',frames:[FILTER192_MASK,FILTER192_FRAME],geometry:{version:1,frames:[{sourceWidth:4,sourceHeight:4,maskBounds:{x:0,y:0,width:1,height:1}},{sourceWidth:2,sourceHeight:4,maskBounds:{x:0,y:0,width:1,height:1}}]}}}
 installBrushPixels(FILTER192_MASK,new Uint8Array(16).fill(64));installBrushPixels(FILTER192_FRAME,new Uint8Array(16).fill(191))
 const execution=mask190RootExecution(b),source={retain:vi.fn(),assertCurrent:vi.fn(),release:vi.fn()},scratch={canonicalSource:source},p=Object.create(BrushBehaviorPainter.prototype)as InstanceType<typeof BrushBehaviorPainter>,target={resolveForPaint:vi.fn(()=>[{originX:0,originY:0,buffer:{width:64,height:64,texture:{}},contentRect:null}])},paint=vi.fn(),request={...dab,size:8,sourceSize:8,t:0}
 source.retain.mockReturnValue(source);Object.assign(p,{ctx:{acquireSprayScratch:vi.fn(()=>{throw Error('allocation before budget')}),reserveCanonicalBeginSource:()=>({kind:'notReady',reason:'resource',retryKey:'ceiling'})},paint,bindings:new Map()})
 // Consume the first incremental request without painting: native geometry state persists.
 const {beginBrushBehavior,behaviorStampsForDab}=await import('../presets/brushBehavior'),state=beginBrushBehavior(request,execution);behaviorStampsForDab(b,request,state,[1,0,0]);Object.assign(scratch,{brushBehavior:state})
 expect(()=>Reflect.apply(p['paintFilter147Requests'],p,[target,[{...request,t:1}],{sizeMultiplier:1},b,{size:false,opacity:false},[1,0,0],scratch,false,undefined,execution,{capability:'filterSmudge147',binding:{prefixKey:'p'}}])).toThrow()
 expect(target.resolveForPaint.mock.calls[0]).toEqual([{minX:16,minY:16,maxX:20,maxY:24}]);expect(paint).not.toHaveBeenCalled();expect(source.release).toHaveBeenCalledTimes(1)
})
it('non-bitmap native Auto192 prewarms curve/noise/spike stamp families without allocating a wet program',()=>{
 const b=filter192(),lookup=`asset:${'192d'.repeat(16)}` as const;b.tip.profile={kind:'curveRectangle',lookup,resolution:4,encoding:'unorm32be',antialias:true};b.tip.autoShape={version:1,spikes:5};b.tip.autoNoise={version:1,density:.8,randomness:.2};installBrushPixels(lookup,new Uint8Array(64))
 const plan=brushPreparationPlan(b);expect(plan.resources.some(r=>r.id===lookup&&r.painter==='stamp')).toBe(true);expect(plan.capabilities).toContain('stampEffects');expect(plan.capabilities).not.toContain('wetCurve')
 const gl=Object.assign(new MockGL(),{blendColor:vi.fn()}),p=new BrushPainter({gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext);p.initGL();try{expect(()=>p.prepareFilterSmudge147(b)).not.toThrow()}finally{p.destroy()}
})
