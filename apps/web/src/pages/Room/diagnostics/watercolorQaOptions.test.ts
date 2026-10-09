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
it('solver batching is OFF unless exact explicit DEV query is enabled',()=>{
 for(const query of ['', '?qaSolverBatch=0','?qaSolverBatch=true','?qaBandBatch=1'])expect(watercolorQaOptions(true,undefined,undefined,query).diagnosticSolverBatch).toBe(false)
 expect(watercolorQaOptions(true,undefined,undefined,'?qaSolverBatch=1').diagnosticSolverBatch).toBe(true)
 expect(watercolorQaOptions(false,undefined,undefined,'?qaSolverBatch=1').diagnosticSolverBatch).toBe(false)
})
it('new-model transport is DEV OFF and requires actual native Room owner',()=>{
 expect(parse(true,'').diagnosticMomentTransport).toBe(false)
 expect(parse(false,'?wcMomentTransport=1').diagnosticMomentTransport).toBe(false)
 expect(parse(false,'?wcMomentTransport=bad&wcMomentTransport=1').diagnosticMomentTransport).toBe(false)
 expect(()=>parse(true,'?wcMomentTransport=1')).toThrow('requires wcNative')
 expect(()=>parse(true,'?wcNative=1&wcMomentTransport=yes')).toThrow('Invalid')
 expect(parse(true,'?wcNative=1&wcMomentTransport=1')).toMatchObject({nativeWatercolor:true,diagnosticMomentTransport:true})
})

it('GPU moment audit requires explicit DEV transport and remains OFF in production',()=>{expect(parse(false,'?wcMomentGpuAudit=1')).toMatchObject({diagnosticMomentGpuAudit:false});expect(parse(true,'').diagnosticMomentGpuAudit).toBe(false);expect(()=>parse(true,'?wcNative=1&wcMomentGpuAudit=1')).toThrow('requires wcMomentTransport');expect(()=>parse(true,'?wcNative=1&wcMomentTransport=1&wcMomentGpuAudit=yes')).toThrow('Invalid');expect(parse(true,'?wcNative=1&wcMomentTransport=1&wcMomentGpuAudit=1')).toMatchObject({diagnosticMomentGpuAudit:true,diagnosticMomentTransport:true})})

it('vector moment is a separate explicit DEV opt-in requiring GPU audit',()=>{expect(parse(false,'?wcMomentVector=1').diagnosticMomentVector).toBe(false);expect(parse(true,'').diagnosticMomentVector).toBe(false);expect(()=>parse(true,'?wcNative=1&wcMomentTransport=1&wcMomentVector=1')).toThrow('requires wcMomentGpuAudit');expect(parse(true,'?wcNative=1&wcMomentTransport=1&wcMomentGpuAudit=1&wcMomentVector=1').diagnosticMomentVector).toBe(true)})

it('native rare-gap A is explicit DEV-only and requires native owner',()=>{
 expect(parse(false,'?wcTipA=1').diagnosticTipContactA).toBe(false)
 expect(parse(true,'').diagnosticTipContactA).toBe(false)
 expect(()=>parse(true,'?wcTipA=1')).toThrow('requires wcNative')
 expect(()=>parse(true,'?wcNative=1&wcTipA=yes')).toThrow('Invalid')
 expect(()=>parse(true,'?wcNative=1&wcTipA=1&wcTipA=0')).toThrow('Invalid')
 expect(parse(true,'?wcNative=1&wcTipA=1').diagnosticTipContactA).toBe(true)
})

it('carry pressure sampling is strict DEV native-only and OFF by default',()=>{
 expect(parse(false,'?wcCarryHardwarePressure=1').diagnosticCarryHardwarePressure).toBe(false)
 expect(parse(true,'').diagnosticCarryHardwarePressure).toBe(false)
 expect(parse(true,'?wcNative=1&wcCarryHardwarePressure=1').diagnosticCarryHardwarePressure).toBe(true)
 expect(()=>parse(true,'?wcCarryHardwarePressure=1')).toThrow('requires wcNative')
 for(const q of ['?wcNative=1&wcCarryHardwarePressure=yes','?wcNative=1&wcCarryHardwarePressure=1&wcCarryHardwarePressure=0'])expect(()=>parse(true,q)).toThrow('Invalid')
 expect(parse(true,'?wcNative=1&wcCarryHardwarePressure=0').diagnosticCarryHardwarePressure).toBe(false)
})

it('detached raw warmup requires native DEV owner and is ignored in production',()=>{
 expect(parse(true,'').diagnosticRawCanvasWarmup).toBe(false)
 expect(parse(true,'?wcNative=1&wcRawCanvasWarmup=1').diagnosticRawCanvasWarmup).toBe(true)
 for(const q of ['?wcRawCanvasWarmup=1','?wcNative=1&wcRawCanvasWarmup=yes','?wcNative=1&wcRawCanvasWarmup=1&wcRawCanvasWarmup=0'])expect(()=>parse(true,q)).toThrow()
 for(const q of ['?wcNative=1&wcRawCanvasWarmup=1','?wcRawCanvasWarmup=bad&wcRawCanvasWarmup=1'])expect(parse(false,q).diagnosticRawCanvasWarmup).toBe(false)
})

it('first LIVE warm is separate native DEV opt-in and invalid requests fail before initialization',()=>{
 expect(parse(true,'').diagnosticFirstLiveWarmup).toBe(false)
 expect(parse(true,'?wcNative=1&wcFirstLiveWarmup=1').diagnosticFirstLiveWarmup).toBe(true)
 expect(parse(true,'?wcNative=1&wcFirstLiveWarmup=0').diagnosticFirstLiveWarmup).toBe(false)
 for(const q of ['?wcFirstLiveWarmup=1','?wcNative=1&wcFirstLiveWarmup=yes','?wcNative=1&wcFirstLiveWarmup=1&wcFirstLiveWarmup=0','?wcNative=1&wcFirstLiveWarmup=1&wcRawCanvasWarmup=1'])expect(()=>parse(true,q)).toThrow()
 for(const q of ['?wcNative=1&wcFirstLiveWarmup=1','?wcFirstLiveWarmup=bad&wcFirstLiveWarmup=1','?wcNative=1&wcFirstLiveWarmup=1&wcRawCanvasWarmup=1'])expect(parse(false,q).diagnosticFirstLiveWarmup).toBe(false)
})
