import{it,expect}from'vitest'
import noise from '../raster/watercolorNoise.txt?raw'
import{fbmArithmetic}from'../../../../../../docs/qa/harness/728-native-end-to-end/fbmArithmetic'
import fixture from'../../../../../../docs/qa/harness/728-native-end-to-end/fbmArithmetic.fixture.json'
it('one-ULP octave-coordinate change predicts captured Surface FBM24 without changing noise lattice',()=>{
 const r=fbmArithmetic(Uint8Array.from(atob(noise),c=>c.charCodeAt(0)),fixture.p as[number,number])
 expect(r.sequential).toEqual(fixture.sequential);expect(r.fused).toEqual(fixture.fused)
 const packed=(rgb:number[])=>rgb[0]*65536+rgb[1]*256+rgb[2]
 expect(r.quantSequential).toBe(packed(fixture.surfaceNativeRgb));expect(r.quantFused).toBe(packed(fixture.surfaceGlRgb))
})
