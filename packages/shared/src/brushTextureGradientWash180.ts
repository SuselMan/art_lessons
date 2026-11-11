import{hasTextureLightnessWash171Scope}from'./brushTextureLightnessWash171.js'
/** New combination only; validation proxy never changes actual gradient pixels/state. */
export function hasTextureGradientWash180Scope(v:unknown):boolean{
 if(!v||typeof v!=='object'||Array.isArray(v))return false
 const d=v as Record<string,unknown>,x=d.texture
 if(!Number.isInteger(d.version)||Number(d.version)<180||!x||typeof x!=='object'||Array.isArray(x))return false
 const t=x as Record<string,unknown>,m=t.material
 if(!m||typeof m!=='object'||Array.isArray(m)||(m as Record<string,unknown>).kind!=='gradient')return false
 return hasTextureLightnessWash171Scope({...d,texture:{...t,material:{...m,kind:'lightness'}}})
}
export function assertTextureGradientWash180Scope(v:unknown):boolean{
 const d=v as {model?:unknown;texture?:{material?:{kind?:unknown}};behavior?:{rendering?:{accumulation?:unknown}}}|null
 if(d?.model!=='stamp'||d.texture?.material?.kind!=='gradient'||d.behavior?.rendering?.accumulation!=='alphaDarken')return false
 if(!hasTextureGradientWash180Scope(v))throw Error('Invalid Texture Gradient Wash180 scope')
 return true
}
