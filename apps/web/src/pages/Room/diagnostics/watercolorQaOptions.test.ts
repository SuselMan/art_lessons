import {expect,it} from 'vitest'
import {watercolorQaOptions} from './watercolorQaOptions'
const parse=(dev:boolean,search:string)=>watercolorQaOptions(dev,undefined,undefined,search)
it('production ignores all QA requests including invalid values',()=>{
 for(const search of ['','?wcGl2=1&wcMrt=1&wcFrontBatch=1','?wcMrt=bad&wcGl2=1&wcGl2=0']){
  const options=parse(false,search);expect(options.diagnosticWebgl2).toBe(false);expect(options.diagnosticBrushMrt).toBe(false);expect(options.diagnosticFrontBatch).toBe(false)
 }
})
it('DEV enables exact explicit bits and rejects ambiguous/unsupported configs',()=>{
 expect(parse(true,'?wcGl2=1&wcMrt=1&wcFrontBatch=1')).toMatchObject({diagnosticWebgl2:true,diagnosticBrushMrt:true,diagnosticFrontBatch:true})
 expect(parse(true,'')).toMatchObject({diagnosticWebgl2:false,diagnosticBrushMrt:false,diagnosticFrontBatch:false})
 for(const search of ['?wcMrt=1','?wcGl2=yes','?wcFrontBatch=2','?wcGl2=1&wcGl2=0'])expect(()=>parse(true,search)).toThrow()
 expect(parse(true,'?wcGl2=0&wcMrt=0&wcFrontBatch=0').diagnosticWebgl2).toBe(false)
})

it('native Room renderer is OFF by default and production ignores it',()=>{
 expect(parse(true,'').nativeWatercolor).toBe(false)
 expect(parse(false,'?wcNative=1').nativeWatercolor).toBe(false)
 expect(parse(true,'?wcNative=1').nativeWatercolor).toBe(true)
 expect(()=>parse(true,'?wcNative=1&wcNative=0')).toThrow()
})
