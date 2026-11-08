import{isIndependentDrawingAnglePair,type BrushDescriptor}from'@grafetto/shared'
import{importedAssetPixels}from'./importedBrushes'
/** Cheap borrowed layout check, before resource planning/leases/derivatives.
 * Static source identities remain owned by the existing imported-asset scope. */
export function assertIndependentLightness128(brush:BrushDescriptor):boolean{
 const child=brush.behavior?.dual?.brush,material=brush.tip.material
 if(!material||!child?.behavior?.strokeInput)return false
 if(!isIndependentDrawingAnglePair(brush))throw Error('Lightness DrawingAngle128 requires a complete matching pair')
 const alpha=brush.tip.mask,gray=material.gray,mask=child.tip.mask,rect=child.tip.imageSampling?.sourceRect
 if(!alpha||!gray||!mask||!rect)throw Error('Missing Lightness DrawingAngle128 sources')
 const length=importedAssetPixels(alpha).length,side=Math.sqrt(length),childSide=Math.sqrt(importedAssetPixels(mask).length)
 if(!Number.isInteger(side)||side<2||side>512||(side&(side-1))!==0||importedAssetPixels(gray).length!==length||!Number.isInteger(childSide)||childSide<2||childSide>512||(childSide&(childSide-1))!==0||rect.x+rect.width>childSide||rect.y+rect.height>childSide)throw Error('Lightness DrawingAngle128 source dimensions differ or exceed512')
 if(brush.tip.animation){
  const frames=brush.tip.animation.frames,grays=material.grayFrames,children=child.tip.animation?.frames
  if(!grays||!children||frames.some((id,i)=>importedAssetPixels(id).length!==length||importedAssetPixels(grays[i]).length!==length)||children.some(id=>importedAssetPixels(id).length!==childSide*childSide))throw Error('Animated Lightness DrawingAngle130 frame dimensions differ')
 }
 const b=brush.tip.maskBounds
 if(!b||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>1||b.y+b.height>1)throw Error('Invalid Lightness DrawingAngle128 source bounds')
 return true
}
