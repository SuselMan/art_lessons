import{assertTextureLightnessWash171Scope,type BrushDescriptor}from'@grafetto/shared'
import{importedAssetPixels}from'./importedBrushes'
/** Borrowed immutable source metadata only. Existing108 upload validates padding. */
export function assertTextureLightnessWash171Planes(brush:BrushDescriptor):boolean{
 if(brush.version===191)return false
 if(!assertTextureLightnessWash171Scope(brush))return false
 const t=brush.texture!,m=t.material!,grid=t.patternSize
 const side=(id:string)=>{const n=Math.sqrt(importedAssetPixels(id).length);if(!Number.isInteger(n)||n<2||n>2048||(n&(n-1))!==0)throw Error('Texture Wash171 source plane is not canonical');return n}
 const mask=side(brush.tip.mask!),gray=side(t.id),alpha=side(m.alpha)
 if(mask<2||gray!==alpha||!grid||!Number.isInteger(grid.width)||!Number.isInteger(grid.height)||grid.width<1||grid.height<1||grid.width>gray||grid.height>gray)throw Error('Texture Wash171 gray/alpha dimensions mismatch')
 return true
}
