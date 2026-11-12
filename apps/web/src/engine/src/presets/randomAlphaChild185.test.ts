import{it,expect}from'vitest'
import{pair185}from'../../../../../../packages/shared/src/randomAlphaChild185.testFixture'
import{ids151}from'../../../../../../packages/shared/src/pixelOriginalDual151.testFixture'
import{beginBrushBehavior,behaviorStampsForDab,secondaryBrushDabs,brushAnimationIndex,type SecondarySamplingState}from'./brushBehavior'
import{installBrushPixels}from'./importedBrushes'
import{brushPreparationPlan}from'../dabs/BrushPreparation'
import{brushDabRandom}from'./digitalBrushPresets'
import type{Dab}from'@grafetto/shared'
const dabs:Dab[]=Array.from({length:8},(_,i)=>({x:i*16,y:0,size:20,pressure:Math.fround(.1+i*.1),opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:i*10}))
it('actual child random selection owns request ordinal/seed and survives chunks/structuredClone without mutating inputs',()=>{
 const parent=pair185(),child=parent.behavior!.dual!.brush,before=structuredClone({parent,dabs})
 const run=(chunks:Dab[][],seed:number)=>{let sampling:SecondarySamplingState={remaining:0},state=beginBrushBehavior(dabs[0]);state.seed=seed;const frames:string[]=[],positions:number[]=[];let parentCounterMismatch=false
 for(const chunk of chunks){for(const request of secondaryBrushDabs(parent,child,chunk,sampling)){const ordinal=state.dabOrdinal??0,index=Math.min(1,Math.floor(brushDabRandom(seed,0x40000+ordinal)*2));expect(brushAnimationIndex(child.tip,seed,ordinal)).toBe(index);const out=behaviorStampsForDab(child,request,state,[1,1,1]);expect(out[0].mask).toBe(child.tip.animation!.frames[index]);if(ordinal!==Math.floor(request.x/16)&&index!==Math.min(1,Math.floor(brushDabRandom(seed,0x40000+Math.floor(request.x/16))*2)))parentCounterMismatch=true;frames.push(out[0].mask!);positions.push(request.x)}sampling=structuredClone(sampling);state=structuredClone(state)}return{sampling,state,frames,positions,parentCounterMismatch}}
 const whole=run([dabs],0x13572468),chunked=run([dabs.slice(0,1),dabs.slice(1,4),dabs.slice(4)],0x13572468);expect(chunked).toEqual(whole);expect(whole.frames.length).toBeGreaterThan(dabs.length);expect(new Set(whole.frames).size).toBe(2);expect(whole.parentCounterMismatch).toBe(true);expect(run([dabs],0x24681357).frames).not.toEqual(whole.frames);expect({parent,dabs}).toEqual(before)
})
it('existing public preflight prepares every random child frame before any drawing',()=>{for(const id of ids151)installBrushPixels(id,new Uint8Array(16).fill(128));const b=pair185(),p=brushPreparationPlan(b);for(const id of b.behavior!.dual!.brush.tip.animation!.frames)expect(p.resources.some(r=>r.id===id&&r.painter==='stamp')).toBe(true);const missing=('asset:'+'185f'.repeat(16))as typeof ids151[0];b.behavior!.dual!.brush.tip.animation!.frames[1]=missing;expect(()=>brushPreparationPlan(b)).toThrow('Brush asset unavailable')})
