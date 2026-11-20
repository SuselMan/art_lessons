import{expect,it}from'vitest'
import type{BrushDeform,Dab}from'@grafetto/shared'
import{deformRequest}from'./brushDeform'
import type{BehaviorStamp}from'./brushBehavior'
const g:BrushDeform={version:1,mode:1,amount:.2,counter:false,bilinear:true,density:1,jitter:0,baseScale:1}
const dab:Dab={x:32,y:32,size:40,pressure:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,opacity:1,t:0}
const stamp:BehaviorStamp={...dab,aspect:1,flowScale:1,wetGrade:0,edgeSoftness:0,bleed:0,opacityScale:1,grainDepth:1,flipX:1,flipY:1,color:[0,0,0],distance:0}
it('Move establishes its origin without painting or advancing counter',()=>{const state={counter:1};expect(deformRequest({...g,mode:5},dab,stamp,1,state,2)).toBeUndefined();expect(state.counter).toBe(1);const next={...dab,x:42};expect(deformRequest({...g,mode:5},next,{...stamp,x:42},1,state,2)).toMatchObject({deltaX:10,deltaY:0,sourceX:42});expect(state.counter).toBe(2)})
it('counter Grow and Shrink use squared count, swirl uses degrees',()=>{expect(deformRequest({...g,counter:true},dab,stamp,1,{counter:2},1)?.factor).toBe(1.04);expect(deformRequest({...g,mode:2,counter:true},dab,stamp,1,{counter:2},1)?.factor).toBe(.96);expect(deformRequest({...g,mode:3,counter:true},dab,stamp,1,{counter:2},1)?.factor).toBeCloseTo(Math.PI/90)})
it('bounds the entire source before allocating and skips singular Shrink',()=>{expect(deformRequest({...g,mode:2,amount:1},dab,stamp,1,{counter:1},1)).toBeUndefined();const r=deformRequest({...g,mode:2,amount:.9},dab,stamp,1,{counter:1},1)!;expect(r.source.minX).toBeLessThan(r.bounds.minX);expect(r.source.maxX).toBeGreaterThan(r.bounds.maxX);expect(deformRequest(g,dab,{...stamp,size:10000},1,{counter:1},1)).toBeUndefined()})
it('jitter changes the mask centre but preserves the source centre',()=>{const a=deformRequest({...g,jitter:1},dab,stamp,1,{counter:1},4)!;expect(a.sourceX).toBe(32);expect(a.sourceY).toBe(32);expect([a.x,a.y]).not.toEqual([32,32]);expect(a).toEqual(deformRequest({...g,jitter:1},dab,stamp,1,{counter:1},4))})
