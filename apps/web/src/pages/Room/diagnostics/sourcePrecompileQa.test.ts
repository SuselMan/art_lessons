import {it,expect} from 'vitest'
import {watercolorQaOptions as options} from './watercolorQaOptions'
it('source preparation is DEV opt-in, strictly parsed and excludes dispatch warm/modified tip recipes',()=>{
 expect(options(true,undefined,undefined,'?wcNative=1').diagnosticSourcePrecompile).toBe(false)
 expect(options(true,undefined,undefined,'?wcNative=1&wcSourcePrecompile=1').diagnosticSourcePrecompile).toBe(true)
 for(const q of ['?wcSourcePrecompile=1','?wcNative=1&wcSourcePrecompile=1&wcFirstLiveWarmup=1','?wcNative=1&wcSourcePrecompile=1&wcRawCanvasWarmup=1','?wcNative=1&wcSourcePrecompile=1&wcTipA=1','?wcNative=1&wcSourcePrecompile=yes','?wcNative=1&wcSourcePrecompile=1&wcSourcePrecompile=0'])expect(()=>options(true,undefined,undefined,q)).toThrow()
 expect(options(false,undefined,undefined,'?wcSourcePrecompile=garbage&wcSourcePrecompile=1').diagnosticSourcePrecompile).toBe(false)
})
