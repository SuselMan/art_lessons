import {expect,it} from 'vitest'
import {hasKnownOperationDiscriminant,hasReservedCanonicalFields} from './operationAdmissionShape.js'
it('reserves explicit canonical close from every generic operation admission',()=>{
 const close={type:'canonical_stroke_close',id:'close',userId:'actor',timestamp:1,seq:2,layerId:'layer',targetUserId:'author',strokeId:'gesture',disposition:'commitPartial',recordedNext:1,firstFrameOpId:'frame',lastFrameOpId:'frame'}
 expect(hasReservedCanonicalFields(close)).toBe(true)
 expect(hasKnownOperationDiscriminant(close)).toBe(false)
 expect(hasKnownOperationDiscriminant({type:'canonical_stroke_close'})).toBe(false)
 expect(hasKnownOperationDiscriminant({type:'operation_undo',id:'undo',userId:'author',timestamp:2,targetOpId:'frame'})).toBe(true)
})
