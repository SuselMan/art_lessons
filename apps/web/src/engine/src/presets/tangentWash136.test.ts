import{it,expect}from'vitest'
import{tangent136,dab136,source136}from'../../../../../../packages/shared/src/tangentWash136.testFixture.js'
import{tangentNormalColor}from'./brushTangentNormal'
import{brushPreparationPlan}from'../dabs/BrushPreparation'
it('uses actual unchanged normal helper; literal opposite tilt colours independent of foreground/canvas receiver',()=>{const b=tangent136();expect(tangentNormalColor(b.tangentNormal!,dab136(60),0)).toEqual([1,128/255,0]);expect(tangentNormalColor(b.tangentNormal!,dab136(-60),0)).toEqual([0,127/255,0]);expect(tangentNormalColor(b.tangentNormal!,dab136(60),source136().normalRotation!)).not.toEqual(tangentNormalColor(b.tangentNormal!,dab136(60),Math.PI/2));expect(brushPreparationPlan(b).capabilities).toContain('stamp');expect(brushPreparationPlan(b).capabilities).not.toContain('requestWash')})
it('independent rational two normals: same alpha does not imply correct colour; pressure history is not relaxed',()=>{const M=1/2,D=M,H=D+(1-D)*M;expect(H).toBe(3/4);const correctRed=H*(1-M),wrongRed=D*(1-M);expect(correctRed).toBe(3/8);expect(wrongRed).toBe(1/4);expect(correctRed/2).toBe(3/16);expect(wrongRed/2).toBe(1/8);expect(H/2).toBe(3/8)})
