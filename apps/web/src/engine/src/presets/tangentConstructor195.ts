import type{BrushDescriptor}from'@grafetto/shared'
import{importedAssetPixels}from'./importedBrushes'
/** Native m_brush width()/height(), before any per-request Size/pressure.
 * Called only for the already admitted195 Tangent role. No RNG/history reads. */
export function tangentConstructorIsPoint195(brush:BrushDescriptor,sourceSize:number):boolean{
 if(!brush.tangentNormal?.sharpnessChecked)return false
 const tip=brush.tip
 if(tip.kind==='bitmap'){
  const source=tip.sourceGeometry??tip.animation?.geometry?.frames[0]
  if(source)return 'width'in source?source.width===1&&source.height===1:source.sourceWidth===1&&source.sourceHeight===1
  const id=tip.mask??tip.animation?.frames[0]
  if(!id)return false
  const side=Math.sqrt(importedAssetPixels(id).length),bounds=tip.maskBounds
  return Math.round(side*(bounds?.width??1))===1&&Math.round(side*(bounds?.height??1))===1
 }
 const width=Math.max(1,Math.trunc(sourceSize)),height=Math.max(1,Math.trunc(width/tip.aspect))
 return width===1&&height===1
}
