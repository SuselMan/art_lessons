import{isEqualLightnessGih123,type BrushDescriptor}from'@grafetto/shared'
import{importedAssetPixels}from'./importedBrushes'
export function isEqualLightnessGih123Candidate(brush:BrushDescriptor):boolean{
 const a=brush.tip.animation
 return !!brush.tip.material&&!!a&&!a.geometry&&['angular','xtilt','ytilt','dimensions'].includes(a.mode)
}
/** Loaded paired metadata only. Called before plan/cache/lease/state; no decode,
 * allocation of pixel planes, byte scan or resource authority inferred here. */
export function assertEqualLightnessGih123(brush:BrushDescriptor):boolean{
 if(!isEqualLightnessGih123Candidate(brush))return false
 if(!isEqualLightnessGih123(brush))throw Error('Equal Lightness sensor requires123 closed scope')
 const a=brush.tip.animation!,m=brush.tip.material!;let side:number|undefined
 for(let i=0;i<a.frames.length;i++){
  const length=importedAssetPixels(a.frames[i]).length,current=Math.sqrt(length)
  if(!Number.isInteger(current)||current<2||current>2048||(current&(current-1))!==0||side!==undefined&&current!==side||importedAssetPixels(m.grayFrames![i]).length!==length)throw Error('Equal Lightness123 physical paired dimensions differ')
  side=current
 }
 return true
}
