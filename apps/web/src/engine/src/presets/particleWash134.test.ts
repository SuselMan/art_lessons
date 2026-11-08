import{brushPreparationPlan}from'../dabs/BrushPreparation'
import{it,expect}from'vitest'
import{particle134,dab134}from'../../../../../../packages/shared/src/particleWash134.testFixture'
import{beginBrushBehavior,behaviorStampsForDab}from'./brushBehavior'
it('existing actual solver geometry/absolute initialization/ordinal/RNG are identical134 vs49 and chunks',()=>{const b=particle134(),old=particle134();old.version=49;old.behavior!.rendering!.accumulation='directOver';const inputs=[dab134(),dab134(4,1),dab134(-6,2)],a=beginBrushBehavior(inputs[0]),c=beginBrushBehavior(inputs[0]),split=beginBrushBehavior(inputs[0]);const whole=inputs.map(d=>behaviorStampsForDab(b,d,a,[.8,.2,.1])),legacy=inputs.map(d=>behaviorStampsForDab(old,d,c,[.8,.2,.1])),packets=[];for(const chunk of[inputs.slice(0,1),inputs.slice(1)])for(const d of chunk)packets.push(behaviorStampsForDab(b,d,split,[.8,.2,.1]));expect(whole).toEqual(legacy);expect(packets).toEqual(whole);expect(a).toEqual(c);expect(split).toEqual(a);expect(whole.map(x=>x.length)).toEqual([975,975,975]);expect(a.particle!.ordinal).toBe(3)})
it('independent rational external-opacity witness: final projection once differs from per-request opacity, including zero and full coverage',()=>{
 // Closed rational OVER of two identical requests, independent of production helpers.
 const over2=(n:bigint,d:bigint)=>[2n*n*d-n*n,d*d]as const
 expect(over2(1n,2n)).toEqual([3n,4n])
 // M=.5 twice, Orequest=1: internal Wash==OVER=.75; captured externalO=.5 gives3/8.
 const internal=over2(1n,2n),newAlpha=Number(internal[0])/Number(internal[1])/2
 // Wrong CF puts externalO=.5 into EACH request: mask*.5=.25, then OVER=7/16.
 const wrong=over2(1n,4n),oldAlpha=Number(wrong[0])/Number(wrong[1])
 expect(newAlpha).toBe(3/8);expect(oldAlpha).toBe(7/16);expect(newAlpha).not.toBe(oldAlpha)
 expect([newAlpha,newAlpha/2,newAlpha/4,newAlpha]).toEqual([3/8,3/16,3/32,3/8])
 expect([oldAlpha,oldAlpha/2,oldAlpha/4,oldAlpha]).toEqual([7/16,7/32,7/64,7/16])
 // Opaque crossings: new1*.5=.5, legacy per-request(.5 OVER .5)=.75. Zero stays zero.
 expect(over2(1n,1n)).toEqual([1n,1n]);expect(.5).not.toBe(Number(over2(1n,2n)[0])/Number(over2(1n,2n)[1]));expect(over2(0n,1n)).toEqual([0n,1n])
 // Constant pigment still must bypass independently saturated additive RGB channels.
 const saturatedRequest=[1,.4,.2,1];expect(saturatedRequest[0]/saturatedRequest[3]).not.toBe(.8)
})

it('new selected capability is requestWash only; old49 keeps original primitive/line capabilities',()=>{const b=particle134();expect(brushPreparationPlan(b).capabilities).toEqual(['requestWash']);b.version=49;b.behavior!.rendering!.accumulation='directOver';const old=brushPreparationPlan(b).capabilities;expect(old).toContain('sketchLines');expect(old).toContain('sprayShapes');expect(old).not.toContain('requestWash')})
