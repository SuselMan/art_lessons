import{it,expect}from'vitest'
import{packDabs,unpackDabs,type Dab}from'@grafetto/shared'
import{childSize187}from'../../../../../../packages/shared/src/childAbsoluteSize187.testFixture'
import{secondaryBrushDabs,behaviorStampsForDab,beginBrushBehavior,brushDynamicValue,type SecondarySamplingState}from'./brushBehavior'
const first:Dab={x:0,y:0,size:4,pressure:.5,tiltX:0,tiltY:0,aspectRatio:1,angle:-.7,sourceAngle:Math.PI/2,opacity:1,t:0}
it('actual child emitted source direction and size differ from parent inputs and use independent first state',()=>{
 const root=childSize187(),child=root.behavior!.dual!.brush,sampling:SecondarySamplingState={remaining:0},inputs=[first,{...first,x:3.1,sourceAngle:Math.PI,t:1},{...first,x:3.1,y:3,sourceAngle:0,t:2}],out=secondaryBrushDabs(root,child,inputs,sampling)
 expect(out.length).toBeGreaterThan(inputs.length);expect(out[0].sourceAngle).toBe(Math.PI/2);expect(out[1].sourceAngle).toBe(0);expect(out.some(d=>d.y>0&&d.sourceAngle!==0)).toBe(true)
 const state=beginBrushBehavior(out[0]),stamps=out.map(d=>behaviorStampsForDab(child,d,state,[1,1,1])[0]);expect(stamps[0].size).toBeCloseTo(.75,12);expect(stamps[1].size).toBeCloseTo(.5,12);expect(state.firstAngle).toBe(Math.PI/2);expect(sampling.geometry?.firstAngle).toBe(Math.PI/2);expect(sampling.geometry).not.toBe(state)
})
it('187 native identity endpoint/offset law applies constant once; nonidentity and old branch unchanged',()=>{
 const root=childSize187(),child=root.behavior!.dual!.brush,control=child.behavior!.modulations!.size![0],a=control.combine!.absolute!
 for(const[angle,offset,size]of[[0,0,.5],[Math.PI,0,1],[-Math.PI,0,0],[Math.PI,360,1],[-Math.PI,-360,0],[0,270,.25]]as const){a.angleOffset=offset;const dab={...first,size:2,sourceAngle:angle};expect(behaviorStampsForDab(child,dab,beginBrushBehavior(dab),[1,1,1])[0].size).toBeCloseTo(size,12)}
 a.angleOffset=0;a.curve={kind:'uniform',samples:Array.from({length:256},(_,i)=>i/510)};const d={...first,size:2,sourceAngle:Math.PI};expect(behaviorStampsForDab(child,d,beginBrushBehavior(d),[1,1,1])[0].size).toBeCloseTo(.75,12)
 a.curve=[[0,0],[1,1]];expect(brushDynamicValue(control,{...first,sourceAngle:Math.PI},beginBrushBehavior(first),0)).toBe(0)
})
it('whole/chunk/codec/fork and END endpoint carry SAME own child source/spacing state',()=>{
 const root=childSize187(),child=root.behavior!.dual!.brush,inputs=unpackDabs(packDabs([first,{...first,x:3.1,sourceAngle:Math.PI,t:1},{...first,x:3.1,y:3,sourceAngle:0,t:2}]))
 const run=(n:number)=>{let s:SecondarySamplingState={remaining:0};const out:Dab[]=[];for(let i=0;i<inputs.length;i+=n){s=structuredClone(s);out.push(...secondaryBrushDabs(root,child,unpackDabs(packDabs(inputs.slice(i,i+n))),s))}const render=beginBrushBehavior(out[0]);return{out,state:s,stamps:out.flatMap(d=>behaviorStampsForDab(child,d,render,[1,1,1])),render}}
 expect(run(1)).toEqual(run(3));const s:SecondarySamplingState={remaining:0},out=secondaryBrushDabs(root,child,inputs.slice(0,2),s);out.push(...secondaryBrushDabs(root,child,[],s,true,{...inputs[2],baseSize:4}));expect(out.map(d=>[d.x,d.y,d.sourceAngle])).toEqual(run(3).out.map(d=>[d.x,d.y,d.sourceAngle]))
 const bad:SecondarySamplingState={remaining:0};expect(()=>secondaryBrushDabs(root,child,[{...first,sourceAngle:undefined}],bad)).toThrow();expect(bad).toEqual({remaining:0})
})
