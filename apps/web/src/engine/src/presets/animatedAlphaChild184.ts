import{assertAnimatedAlphaChild184Scope,type BrushDescriptor}from'@grafetto/shared'
import{importedAssetPixels}from'./importedBrushes'
/** No GL/behavior state before the complete child frame bank is present and bounded. */
export function assertAnimatedAlphaChild184Ready(brush:BrushDescriptor,effectiveErase=false):boolean{
 if(!assertAnimatedAlphaChild184Scope(brush))return false
 if(effectiveErase)throw Error('Animated ALPHAMASK child184 erase is outside scope')
 const frames=brush.behavior!.dual!.brush.tip.animation!.frames
 const sides=frames.map(id=>Math.sqrt(importedAssetPixels(id).length))
 if(sides.some(n=>!Number.isInteger(n)||n<2||n>512||(n&(n-1))!==0)||sides.some(n=>n!==sides[0]))throw Error('Animated ALPHAMASK child184 CAS dimensions mismatch')
 return true
}
