import{assertTextureGradientWash180Scope,type BrushDescriptor}from'@grafetto/shared'
import{assertTextureLightnessWash171Planes}from'./textureLightnessWash171'
/** Borrow existing metadata validation only; no packing/upload/cached proxy. */
export function assertTextureGradientWash180Planes(brush:BrushDescriptor):boolean{
 if(brush.version===191)return false
 if(!assertTextureGradientWash180Scope(brush))return false
 return assertTextureLightnessWash171Planes({...brush,texture:{...brush.texture!,material:{...brush.texture!.material!,kind:'lightness'}}})
}
