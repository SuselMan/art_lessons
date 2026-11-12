import{it,expect}from'vitest'
import{pair184}from'../../../../../../packages/shared/src/animatedAlphaChild184.testFixture'
import{ids151}from'../../../../../../packages/shared/src/pixelOriginalDual151.testFixture'
import{beginBrushBehavior,behaviorStampsForDab,secondaryBrushDabs,brushAnimationIndex,type SecondarySamplingState}from'./brushBehavior'
import{assertAnimatedAlphaChild184Ready}from'./animatedAlphaChild184'
import{installBrushPixels}from'./importedBrushes'
import{brushPreparationPlan}from'../dabs/BrushPreparation'
import type{Dab,AssetId}from'@grafetto/shared'
const dabs:Dab[]=Array.from({length:4},(_,i)=>({x:i*16,y:0,size:20,pressure:Math.fround(.2+i*.2),opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:i*10}))
it('independent emitted-child ordinal/pressure, not parent packet count; whole/chunk/clone exact',()=>{
 for(const mode of['incremental','constant','pressure']as const){const parent=pair184(mode),child=parent.behavior!.dual!.brush
  const run=(chunks:Dab[][])=>{let sampling:SecondarySamplingState={remaining:0},state=beginBrushBehavior(dabs[0]);const frames:string[]=[];let count=0
   for(const chunk of chunks){const requests=secondaryBrushDabs(parent,child,chunk,sampling);for(const request of requests){if(request.x>0&&request.x<48&&request.x%16!==0){const i=Math.floor(request.x/16),t=(request.x-dabs[i].x)/16;expect(request.pressure).toBeCloseTo(Math.fround(dabs[i].pressure+(dabs[i+1].pressure-dabs[i].pressure)*t),6)}if(mode==='pressure')expect(brushAnimationIndex(child.tip,0,count,0,request.pressure)).toBe((Math.trunc(Math.fround(request.pressure)+.5)>>>0)%2);const out=behaviorStampsForDab(child,request,state,[1,1,1]);expect(out[0].mask).toBe(child.tip.animation!.frames[brushAnimationIndex(child.tip,state.seed,count,0,request.pressure)!]);frames.push(out[0].mask!);count++}sampling=structuredClone(sampling);state=structuredClone(state)}return{sampling,state,frames,count}}
  const whole=run([dabs]),chunks=run([dabs.slice(0,1),dabs.slice(1,3),dabs.slice(3)]);expect(chunks).toEqual(whole);expect(whole.count).toBeGreaterThan(dabs.length)
  if(mode==='incremental')expect(whole.frames.slice(0,4)).toEqual([ids151[1],ids151[2],ids151[1],ids151[2]])
 }
})
it('actual public preparation plans EVERY child frame and rejects missing/unequal CAS before rendering',()=>{
 for(const id of ids151)installBrushPixels(id,new Uint8Array(16).fill(128))
 const brush=pair184();expect(assertAnimatedAlphaChild184Ready(brush)).toBe(true)
 const plan=brushPreparationPlan(brush);for(const id of brush.behavior!.dual!.brush.tip.animation!.frames)expect(plan.resources.some(r=>r.id===id&&r.painter==='stamp')).toBe(true)
 const missing=('asset:'+'184f'.repeat(16))as AssetId;brush.behavior!.dual!.brush.tip.animation!.frames[1]=missing
 expect(()=>brushPreparationPlan(brush)).toThrow('Brush asset unavailable')
 installBrushPixels(missing,new Uint8Array(4).fill(128));expect(()=>brushPreparationPlan(brush)).toThrow('CAS dimensions')
 expect(()=>assertAnimatedAlphaChild184Ready(pair184(),true)).toThrow('erase')
})
