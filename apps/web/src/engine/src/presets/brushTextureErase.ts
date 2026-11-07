/** Import-time source law: additional inversion occurs BEFORE neutral-point
 * mapping/cutoff, so an erase variant must be baked from the original pattern. */
export function textureEffectiveInvert(authoredInvert:boolean,autoInvertOnErase:boolean,effectiveErase:boolean):boolean{
 if([authoredInvert,autoInvertOnErase,effectiveErase].some(v=>typeof v!=='boolean'))throw TypeError('Expected captured texture erase flags')
 return authoredInvert!==(autoInvertOnErase&&effectiveErase)
}
/** Select from immutable descriptor resources using a RECORDED effective mode.
 * No UI reads, pixel inversion, asset mutation, or alternate sampler. */
export function textureEraseId<T extends string>(texture:Readonly<{id:T;eraseId?:T}>|undefined,effectiveErase:boolean):T|undefined{
 if(typeof effectiveErase!=='boolean')throw TypeError('Expected captured texture erase mode')
 return texture&&(effectiveErase?texture.eraseId??texture.id:texture.id)
}
