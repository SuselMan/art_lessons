import{expect,it}from'vitest'
import{gradient138}from'../../../../../../packages/shared/src/pixelGradientWash138.testFixture'
import{assertPixelOriginalRgba,pixelOriginalRgbaFrames}from'./pixelOriginalRgba'
import{installBrushPixels,clearImportedBrushPixels}from'./importedBrushes'
import{createHash}from'node:crypto'
it('admits only138 staticfilteredGradient Wash; old97/100 directOver policy remains exact',()=>{
 const b=gradient138();expect(()=>assertPixelOriginalRgba(b)).not.toThrow()
 const low=gradient138();low.version=137;expect(()=>assertPixelOriginalRgba(low)).toThrow('combination')
 for(const version of[97,100]){const old=gradient138();old.version=version;old.behavior!.rendering!.accumulation='directOver';if(version===97&&old.tip.color&&'gradient'in old.tip.color)delete old.tip.color.gradient.sampling;expect(()=>assertPixelOriginalRgba(old)).not.toThrow()}
})
it('actual loaded138 planes are fullsamePOTside<=512 before any prepared resource owner',()=>{
 function installCase(alphaSide:number,graySide:number){
  const b=gradient138(),alpha=new Uint8Array(alphaSide*alphaSide),gray=new Uint8Array(graySide*graySide)
  const alphaId=`asset:${createHash('sha256').update(alpha).digest('hex')}`as const,grayId=`asset:${createHash('sha256').update(gray).digest('hex')}`as const
  b.tip.mask=alphaId
  if(!b.tip.color||!('gradient'in b.tip.color))throw Error('Expected gradient fixture')
  b.tip.color.gradient.gray=grayId
  installBrushPixels(alphaId,alpha);installBrushPixels(grayId,gray)
  return b
 }
 try{
  const valid=installCase(4,4);expect(pixelOriginalRgbaFrames(valid)).toEqual([{id:valid.tip.mask,planes:[valid.tip.mask,valid.tip.mask,valid.tip.mask]}])
  expect(()=>pixelOriginalRgbaFrames(installCase(4,8))).toThrow('dimensions')
  expect(()=>pixelOriginalRgbaFrames(installCase(1024,1024))).toThrow('dimensions')
 }finally{clearImportedBrushPixels()}
})
