import{it,expect}from'vitest'
import{packDabs,unpackDabs,type Dab}from'@grafetto/shared'
import{childSize187}from'../../../../../../packages/shared/src/childAbsoluteSize187.testFixture.js'
import{secondaryBrushDabs,behaviorStampsForDab,beginBrushBehavior,type SecondarySamplingState}from'./brushBehavior.js'
const first:Dab={x:0,y:0,size:4,pressure:.5,tiltX:0,tiltY:0,aspectRatio:1,angle:-.7,sourceAngle:Math.PI/2,opacity:1,t:0}
function pair(){const root=childSize187();root.version=189;const child=root.behavior!.dual!.brush;child.version=189;child.behavior!.modulations!.size![0].combine!.absolute!.locked=true;return{root,child}}
it('189 locked own child angle stays .75 after turns; 187 stays unlocked',()=>{
 const{root,child}=pair(),sampling:SecondarySamplingState={remaining:0},inputs=[first,{...first,x:3.1,sourceAngle:Math.PI,t:1},{...first,x:3.1,y:3,sourceAngle:0,t:2}],out=secondaryBrushDabs(root,child,inputs,sampling),state=beginBrushBehavior(out[0]),stamps=out.map(d=>behaviorStampsForDab(child,d,state,[1,1,1])[0]);expect(out[1].sourceAngle).toBe(0);expect(stamps.every(s=>Math.abs(s.size-.75)<1e-12)).toBe(true);expect(state.firstAngle).toBe(Math.PI/2);expect(sampling.geometry?.firstAngle).toBe(Math.PI/2);expect(state.firstAngle).not.toBe(first.angle)
 const old=childSize187().behavior!.dual!.brush,oldState=beginBrushBehavior(out[0]);expect(behaviorStampsForDab(old,out[0],oldState,[1,1,1])[0].size).toBe(.75);expect(behaviorStampsForDab(old,out[1],oldState,[1,1,1])[0].size).toBe(.5)
})
it('first tiny or zero request latches render and geometry; +pi identity is one',()=>{
 for(const size of[0,1e-8]){const{root,child}=pair(),sampling:SecondarySamplingState={remaining:0},out=secondaryBrushDabs(root,child,[{...first,size},{...first,x:1,t:1}],sampling),state=beginBrushBehavior(out[0]);behaviorStampsForDab(child,out[0],state,[1,1,1]);expect(state.previous).toBeDefined();expect(behaviorStampsForDab(child,{...first,size:2,sourceAngle:0},state,[1,1,1])[0].size).toBe(.75);expect(state.firstAngle).toBe(Math.PI/2);expect(sampling.geometry?.firstAngle).toBe(Math.PI/2)}
 const{child}=pair(),dab={...first,size:2,sourceAngle:Math.PI};expect(behaviorStampsForDab(child,dab,beginBrushBehavior(dab),[1,1,1])[0].size).toBe(1)
})
it('whole/chunks/fork/codec and END preserve own locked state',()=>{
 const{root,child}=pair(),inputs=unpackDabs(packDabs([first,{...first,x:3.1,sourceAngle:Math.PI,t:1},{...first,x:3.1,y:3,sourceAngle:0,t:2}]))
 const run=(n:number)=>{let s:SecondarySamplingState={remaining:0};const out:Dab[]=[];for(let i=0;i<inputs.length;i+=n){s=structuredClone(s);out.push(...secondaryBrushDabs(root,child,inputs.slice(i,i+n),s))}let render=beginBrushBehavior(out[0]);const stamps=out.flatMap(d=>{render=structuredClone(render);return behaviorStampsForDab(child,d,render,[1,1,1])});return{out,state:s,stamps,render}}
 expect(run(1)).toEqual(run(3));const s:SecondarySamplingState={remaining:0},out=secondaryBrushDabs(root,child,inputs.slice(0,2),s);out.push(...secondaryBrushDabs(root,child,[],s,true,{...inputs[2],baseSize:4}));expect(out).toEqual(run(3).out);expect(s.geometry?.firstAngle).toBe(Math.PI/2)
})
