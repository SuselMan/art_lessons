/** Own128 P/C are NEAREST transport fields. Temporarily interpolate BOTH only
 * for material reconstruction. Texture content and all source bindings unchanged.
 * No other sampler of these fields executes inside the synchronous callback.
 */
export function withPreviewMaterialLinear(gl,p,c,draw){
 if(p===c||p.texture===c.texture||p.width!==128||p.height!==128||c.width!==128||c.height!==128)throw Error('Own paired128 fields required');
 const set=filter=>{for(const f of[p,c]){gl.bindTexture(gl.TEXTURE_2D,f.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter)}};
 // These fields are allocated NEAREST by the owned preview pool. Restore that
 // contract even when the reconstruction throws; never change source textures.
 try{gl.activeTexture(gl.TEXTURE0);set(gl.LINEAR);return draw()}finally{set(gl.NEAREST);gl.activeTexture(gl.TEXTURE0)}
}
