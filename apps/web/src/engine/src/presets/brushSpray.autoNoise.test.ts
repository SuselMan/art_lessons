import { expect, it } from 'vitest'
import {isBrushLibrary,type BrushDescriptor,type BrushSpray,type Dab} from '@grafetto/shared'
import {brushExecutionContext} from './brushExecutionContext'
import {brushPreparationPlan} from '../dabs/BrushPreparation'
import {autoMaskNoiseKey,autoMaskNoiseAlpha,prepareAutoMaskNoise} from '../raster/autoMaskNoise'
import { beginBrushBehavior, behaviorStampsForDab } from './brushBehavior'
const encode=(f:(x:number)=>number)=>Array.from({length:257},(_,i)=>Math.round(f(i/256)*65535).toString(16).padStart(4,'0')).join('')
const lut=encode(x=>x)
const spray:BrushSpray={version:1,diameter:100,scale:1,aspect:1,angle:0,count:1000,jitter:0,radial:{maximum:1,samples:lut},angular:lut,particle:{shape:'ellipse',width:4,height:2,proportional:false},dynamics:{randomSize:false,fixedAngle:0,randomAngle:0,radialAngle:0,pathAngle:0},color:{perParticle:true,hue:0,saturation:0,value:0,randomOpacity:false}}
const brush:BrushDescriptor={id:'test',version:42,model:'stamp',category:'scatter',tip:{kind:'round',hardness:1,aspect:1,rotation:'fixed',angle:0},paperInteraction:0,spacing:.25,flow:1,flowPer:'stamp',sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],pressureSmoothingPx:0,opacity:1,spray,behavior:{version:2}}
const dab:Dab={x:0,y:0,size:100,angle:0,aspectRatio:1,pressure:.5,tiltX:0,tiltY:0,opacity:1,t:0}

function noisy():BrushDescriptor{return{...structuredClone(brush),id:'imported-9696969696969696',version:96,tip:{kind:'procedural',hardness:1,aspect:1,angle:0,rotation:'fixed',profile:{kind:'standard',shape:'ellipse',horizontalFade:1,verticalFade:1,antialias:false},autoNoise:{version:1,density:.5,randomness:.4}},spray:{...structuredClone(spray),count:4,particle:{...spray.particle,shape:'tip'}}}}
const library=(b:BrushDescriptor)=>({schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Authored Spray Auto noise',source:'kpp',warnings:[],descriptor:b}]})
it('admits only revision96 independent procedural Spray tips without opening source or image paths',()=>{
 const b=noisy();expect(isBrushLibrary(library(b))).toBe(true)
 expect(brushPreparationPlan(b).capabilities).toContain('stampEffects');expect(brushPreparationPlan(b).capabilities).not.toContain('sprayImages');expect(brushPreparationPlan(b).capabilities).not.toContain('spraySources')
 for(const version of [43,74,76,95]){b.version=version;expect(isBrushLibrary(library(b))).toBe(false)}
 b.version=96
 for(const key of ['sampleInput','mixBackground','fillBackground']as const){b.spray!.color[key]=true;expect(isBrushLibrary(library(b))).toBe(false);delete b.spray!.color[key]}
 b.spray!.particle.image=true;expect(isBrushLibrary(library(b))).toBe(false);delete b.spray!.particle.image
 b.spray!.particle.shape='ellipse';expect(isBrushLibrary(library(b))).toBe(false);b.spray!.particle.shape='tip'
 b.behavior!.dual={brush:{...noisy(),spray:undefined},blendMode:'multiply'};expect(isBrushLibrary(library(b))).toBe(false)
 delete b.behavior!.dual;delete b.tip.autoNoise;b.version=43;expect(isBrushLibrary(library(b))).toBe(true)
})
it('assigns separate captured noise to each particle and preserves whole versus split packet replay',()=>{
 const b=noisy(),inputs=[dab,{...dab,t:10},{...dab,t:20}],execution=brushExecutionContext({version:1,strokeSeed:123,sequentialSeed:456})
 const run=(chunks:Dab[][])=>{const state=beginBrushBehavior(dab,execution);return chunks.flatMap(chunk=>chunk.flatMap(d=>behaviorStampsForDab(b,d,state,[.2,.3,.4])))}
 const whole=run([inputs]),split=run([[inputs[0]],inputs.slice(1)])
 expect(whole).toEqual(split);expect(whole).toHaveLength(12)
 expect(new Set(whole.slice(0,4).map(s=>s.autoNoiseKey)).size).toBe(4)
 for(let d=0;d<3;d++)for(let p=0;p<4;p++)expect(whole[d*4+p].autoNoiseKey).toBe(autoMaskNoiseKey(123,d,p,0))
 expect(()=>behaviorStampsForDab(b,dab,beginBrushBehavior(dab),[.2,.3,.4])).toThrow('captured stroke seed')
})
it('changes per-pixel coverage without changing particle geometry or count',()=>{
 const b=noisy(),execution=brushExecutionContext({version:1,strokeSeed:123,sequentialSeed:456}),plain=structuredClone(b);delete plain.tip.autoNoise
 const noisyStamps=behaviorStampsForDab(b,dab,beginBrushBehavior(dab,execution),[.2,.3,.4]),ordinary=behaviorStampsForDab(plain,dab,beginBrushBehavior(dab,execution),[.2,.3,.4])
 expect(noisyStamps.map(({autoNoiseKey:_,...s})=>s)).toEqual(ordinary)
 const zero=prepareAutoMaskNoise(0,0),full=prepareAutoMaskNoise(1,0),random=prepareAutoMaskNoise(1,1)
 for(const s of noisyStamps){expect(autoMaskNoiseAlpha(255,zero,s.autoNoiseKey!,0,0)).toBe(0);expect(autoMaskNoiseAlpha(255,full,s.autoNoiseKey!,0,0)).toBe(255);expect(autoMaskNoiseAlpha(255,random,s.autoNoiseKey!,0,0)).toBeLessThanOrEqual(255)}
})
