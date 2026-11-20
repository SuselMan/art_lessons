import{isUnequalLightnessGih124,type BrushDescriptor}from'@grafetto/shared'
import{importedAssetPixels}from'./importedBrushes'
import{captureGihFrameMetadata}from'../raster/gihFrameGeometry'
/** Full loaded metadata only; no mip building, pixel scan or resource authority. */
export function assertUnequalLightnessGih124(brush:BrushDescriptor,mask190=false):boolean{
 const a=brush.tip.animation
 if(!brush.tip.material||!a?.geometry||!['angular','xtilt','ytilt','dimensions'].includes(a.mode))return false
 if(!mask190&&!isUnequalLightnessGih124(brush))throw Error('Unequal Lightness sensor requires124 closed scope')
 const gray=brush.tip.material.grayFrames!,sides=a.frames.map((id,index)=>{
  const length=importedAssetPixels(id).length,side=Math.sqrt(length)
  if(!Number.isInteger(side)||side<2||side>2048||(side&(side-1))!==0||importedAssetPixels(gray[index]).length!==length)throw Error('Unequal Lightness124 paired dimensions differ')
  return side
 })
 const rows=captureGihFrameMetadata(a.geometry.frames,sides),bounds=brush.tip.maskBounds
 if(!bounds||(['x','y','width','height']as const).some(k=>!Object.is(bounds[k],rows[0].maskBounds[k])))throw Error('Unequal Lightness124 reference bounds differ')
 return true
}
