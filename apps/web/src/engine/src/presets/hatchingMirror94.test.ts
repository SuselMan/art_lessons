import {expect,it} from 'vitest'
import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {DIGITAL_BRUSHES} from './digitalBrushPresets'
import {beginBrushBehavior,behaviorStampsForDab} from './brushBehavior'
import {hatchingPlane} from './brushHatching'
const input=(pressure:number):Dab=>({x:20,y:30,size:16,pressure,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:1})
function brush(horizontal=true,vertical=false):BrushDescriptor{return{...DIGITAL_BRUSHES[0],version:94,model:'stamp',paperInteraction:0,flow:1,flowPer:'stamp',texture:undefined,wet:undefined,scatter:undefined,tip:{kind:'bitmap',mask:`asset:${'a'.repeat(64)}`,hardness:1,aspect:1,angle:0,rotation:'fixed'},sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,mirror:{horizontal,vertical,value:1,dynamics:[{control:'pressure',minimum:0,jitter:0}]},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}},hatching:{version:1,angle:30,separation:8,thickness:2,origin:[0,0],style:'none',intervals:4,antialias:true,subpixel:true}}}
const stamp=(b:BrushDescriptor,p:number)=>{const dab=input(p);return behaviorStampsForDab(b,dab,beginBrushBehavior(dab),[.8,.2,.1])[0]}
// Independently authored asymmetric4x4 alpha mask: all four corners differ.
const alpha=new Uint8Array([255,0,0,64,0,0,0,0,0,0,0,0,128,0,0,0])
const corner=(s:{flipX:number;flipY:number})=>alpha[(s.flipY<0?3:0)*4+(s.flipX<0?3:0)]
it('uses one native >=0.5 response for the enabled Hatching mask axes and preserves asymmetric channels',()=>{
 for(const [horizontal,vertical,wanted]of[[true,false,64],[false,true,128],[true,true,0]]as const){
  const b=brush(horizontal,vertical),before=stamp(b,.49),edge=stamp(b,.5),after=stamp(b,.51)
  expect(corner(before)).toBe(255);expect(corner(edge)).toBe(wanted);expect(corner(after)).toBe(wanted)
  expect([edge.flipX,edge.flipY]).toEqual([horizontal?-1:1,vertical?-1:1])
 }
})
it('mirrors only the selection mask and never reflects the world-anchored hatch plane',()=>{
 const b=brush(),a=stamp(b,.49),c=stamp(b,.5)
 expect(a.hatching).toEqual(c.hatching)
 if(!a.hatching||!c.hatching||!b.hatching)throw Error('Missing actual hatching placement')
 expect(a.hatching.angles.map(angle=>hatchingPlane(angle,a.hatching!.separation,b.hatching!.origin,0,0,true))).toEqual(c.hatching.angles.map(angle=>hatchingPlane(angle,c.hatching!.separation,b.hatching!.origin,0,0,true)))
})
it('keeps the unmirrored historical67 result when no active Mirror is present',()=>{
 const b=brush();b.version=67;delete b.behavior!.mirror
 for(const pressure of [.49,.5,.51])expect([stamp(b,pressure).flipX,stamp(b,pressure).flipY]).toEqual([1,1])
})
