import{it,expect}from'vitest'
import{packDabs,unpackDabs,type Dab}from'@grafetto/shared'
import{secondaryBrushDabs,behaviorStampsForDab,beginBrushBehavior,type SecondarySamplingState}from'./brushBehavior'
import{pair130,masks130,alphas130,grays130,libraryCounts130}from'../../../../../../packages/shared/src/childLightness130.testFixture'
const first:Dab={x:0,y:0,size:4,pressure:1,tiltX:0,tiltY:0,aspectRatio:1,angle:0,sourceAngle:Math.PI/2,opacity:1,t:0}
const inputs=[first,{...first,x:3,t:1},{...first,x:3,y:3,t:2}]
it('root scatter/HSV/texture do not move unscattered child cursor or borrow root frame ordinal',()=>{
 const root=pair130(),child=root.behavior!.dual!.brush,sampling:SecondarySamplingState={remaining:0},out=secondaryBrushDabs(root,child,inputs,sampling)
 const plain=pair130();delete plain.scatter;delete plain.behavior!.scatter;delete plain.behavior!.colorAdjustment;delete plain.texture
 const other:SecondarySamplingState={remaining:0};expect(secondaryBrushDabs(plain,plain.behavior!.dual!.brush,inputs,other)).toEqual(out);expect(other.sourceCursor).toEqual(sampling.sourceCursor)
 expect(out.map(d=>[d.x,d.y])).toEqual([[0,0],[2,0],[3,1],[3,3]]);expect(out[2].sourceAngle).toBeCloseTo(Math.PI/4,6)
 const state=beginBrushBehavior(out[0]),stamps=out.map(d=>behaviorStampsForDab(child,d,state,[1,1,1])[0]);expect(stamps.every(s=>masks130.includes(s.mask as typeof masks130[number]))).toBe(true);expect(state.dabOrdinal).toBe(4)
 const rootState=beginBrushBehavior(first),rootStamps=inputs.map(d=>behaviorStampsForDab(root,d,rootState,[.8,.2,.1])[0]);expect(rootState.dabOrdinal).toBe(3);expect(rootStamps.some((s,i)=>s.x!==inputs[i].x||s.y!==inputs[i].y)).toBe(true)
 expect(rootStamps.every(s=>s.dualMask===undefined&&s.dualGray===undefined)).toBe(true)
 for(const s of rootStamps){const i=alphas130.indexOf(s.mask as typeof alphas130[number]);expect(i).toBeGreaterThanOrEqual(0);expect(s.gray).toBe(grays130[i])}
 expect(stamps.map(s=>s.angle)).not.toEqual(out.map(()=>first.sourceAngle))
})
it('random child continuation remains identical across codec/chunks/fork; prestate parent failure stays closed',()=>{
 const run=(n:number)=>{const root=pair130(),child=root.behavior!.dual!.brush;let sampling:SecondarySamplingState={remaining:0};const state=beginBrushBehavior(first),out=[];for(let i=0;i<inputs.length;i+=n){sampling=structuredClone(sampling);for(const d of secondaryBrushDabs(root,child,unpackDabs(packDabs(inputs.slice(i,i+n))),sampling))out.push(behaviorStampsForDab(child,d,state,[1,1,1]))}return{out,sampling,state}}
 expect(run(1)).toEqual(run(3));const root=pair130();root.version=129;const s:SecondarySamplingState={remaining:0};expect(()=>secondaryBrushDabs(root,root.behavior!.dual!.brush,inputs,s)).toThrow('matching120');expect(s).toEqual({remaining:0})
})

it('3/4 pair uses its own child ordinals and no unused child sampler escapes into root strict lease',()=>{
 const root=libraryCounts130(3,4,4).brushes[0].descriptor,child=root.behavior!.dual!.brush,sampling:SecondarySamplingState={remaining:0},out=secondaryBrushDabs(root,child,inputs,sampling)
 const parentState=beginBrushBehavior(first),childState=beginBrushBehavior(first)
 const parent=inputs.flatMap(d=>behaviorStampsForDab(root,d,parentState,[.8,.2,.1]));const mask=out.flatMap(d=>behaviorStampsForDab(child,d,childState,[1,1,1]))
 expect(parentState.dabOrdinal).toBe(3);expect(childState.dabOrdinal).toBe(4);expect(mask.every(s=>child.tip.animation!.frames.some(id=>id===s.mask))).toBe(true)
 expect(parent.every(s=>s.dualMask===undefined&&s.dualGray===undefined)).toBe(true)
})

it('historical non-pair random/incremental dual metadata keeps its original parent route',()=>{
 const b=pair130(),c=b.behavior!.dual!.brush;b.version=c.version=34;delete b.behavior!.strokeInput;delete c.behavior!.strokeInput
 const random=behaviorStampsForDab(b,first,beginBrushBehavior(first),[1,1,1])[0];expect(c.tip.animation!.frames.some(id=>id===random.dualMask)).toBe(true)
 b.tip.animation!.mode=c.tip.animation!.mode='incremental';const state=beginBrushBehavior(first),a=behaviorStampsForDab(b,first,state,[1,1,1])[0],next=behaviorStampsForDab(b,{...first,x:2},state,[1,1,1])[0]
 expect([a.mask,a.dualMask,next.mask,next.dualMask]).toEqual([alphas130[0],masks130[0],alphas130[1],masks130[1]])
})
