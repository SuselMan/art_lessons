import {expect,it} from 'vitest'
import {genuineBristle93Fixture} from '../../testing/bristle93Fixture'
import {installBrushPixels} from '../presets/importedBrushes'
import {brushPreparationPlan} from './BrushPreparation'

const sourceMask=`asset:${'e'.repeat(64)}` as const
function fixture() {
 const {descriptor,bristle}=genuineBristle93Fixture()
 const {ink:_ink,soak:_soak,saturationLookup:_lookup,...geometry}=bristle
 return {...descriptor,version:143,bristle:{...geometry,version:1 as const,initialization:{resizePolicy:'source-area143-v1' as const,sourceSide:4,sourceMask,sourceBounds:{x:0,y:0,width:2,height:4},rotation:[65536,0] as [number,number]}}}
}
it('requires source143 CPU pixels without adding a GPU resource',()=>{
 const descriptor=fixture()
 expect(()=>brushPreparationPlan(descriptor)).toThrow('Brush asset unavailable')
 installBrushPixels(sourceMask,new Uint8Array(16).fill(255))
 const plan=brushPreparationPlan(descriptor)
 expect(plan.resources.some(resource=>resource.id===sourceMask)).toBe(false)
 expect(plan.capabilities).toContain('sketchLines')
 expect(()=>brushPreparationPlan({...descriptor,bristle:{...descriptor.bristle,initialization:{...descriptor.bristle.initialization,sourceSide:8}}})).toThrow('CAS dimensions')
})
