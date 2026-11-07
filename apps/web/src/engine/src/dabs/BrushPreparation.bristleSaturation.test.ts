import {it,expect} from 'vitest'
import {genuineBristle93Fixture} from '../../testing/bristle93Fixture'
import {brushPreparationPlan,brushPreparationBytes,brushPreparationTransientBytes,brushTextureLeasePlan,assertNativeImageAdmission} from './BrushPreparation'
import {bristleSaturationResourceKey} from './BristleSaturationResource'
it('declares a dedicated512KiB GPU resource and separate512KiB upload transient in the existing plan',()=>{
 const {descriptor,bristle}=genuineBristle93Fixture(),plan=brushPreparationPlan(descriptor)
 const resources=plan.resources.filter(r=>r.bristleSaturation)
 expect(resources).toHaveLength(1);expect(resources[0].lookup32).toBeUndefined()
 expect(brushPreparationBytes(resources,()=>{throw Error('Saturation is not a radial ALPHA plane')})).toBe(512*1024)
 expect(brushPreparationTransientBytes(resources)).toBe(512*1024)
 expect(brushTextureLeasePlan(resources,'stamp')).toEqual([{key:bristleSaturationResourceKey(bristle),bytes:512*1024}])
 expect(()=>assertNativeImageAdmission(resources,1023)).toThrow('dimension')
 expect(()=>assertNativeImageAdmission(resources,1024)).not.toThrow()
})
it('adds no saturation resource, transient or sampler lease to the ordinary72 profile',()=>{
 const {descriptor,bristle}=genuineBristle93Fixture()
 if(bristle.version!==2)throw Error('fixture')
 const old={...descriptor,version:72,bristle:{...bristle,ink:{...bristle.ink,useSaturation:false},saturationLookup:undefined}}
 const plan=brushPreparationPlan(old)
 expect(plan.resources.some(r=>r.bristleSaturation)).toBe(false);expect(brushPreparationTransientBytes(plan.resources)).toBe(0)
})
