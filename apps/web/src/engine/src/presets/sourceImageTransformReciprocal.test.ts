import{expect,it}from'vitest'
import native from'./fixtures/sourceImageRoundEven.native.json'
import{sourceImageRoundEven}from'./sourceImageTransformReciprocal'
it('matches original installed FRINTI+FCVTNS FPCR0 at positive and negative half-integer ties',()=>{
 expect(native.arithmeticHooks).toBe(0);expect(native.FPCR).toBe(0)
 const view=new DataView(new ArrayBuffer(4))
 for(const[bits,expected]of native.cases){view.setUint32(0,bits,true);const value=view.getFloat32(0,true);expect(sourceImageRoundEven(value),`native ${value}`).toBe(expected)}
})
