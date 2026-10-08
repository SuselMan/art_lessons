/** OFF QA only. Pre-create the GL name; dynamic raster bounds still choose storage. */
export function prewarmWetOverlayTexture(engine){
 const gl=engine.gl;if(engine._strokeId||engine._settle||engine._wcCanonical.pending)throw Error('Wet texture prewarm requires idle pre-input engine');
 if(gl.isContextLost())throw Error('Cannot prewarm lost context');
 if(!Array.isArray(engine._wetTexSize)||engine._wetTexSize.length!==2||!engine._wetTexSize.every(v=>Number.isSafeInteger(v)&&v>=0))throw Error('Actual wet texture dimension metadata required');
 const existingBytes=engine._wetTexSize[0]*engine._wetTexSize[1]*4;if(!Number.isSafeInteger(existingBytes))throw Error('Safe actual wet texture storage accounting required');
 if(engine._wetTex)return{created:false,storageDimensions:[...engine._wetTexSize],storageBytes:existingBytes};
 if(engine._wetTexSize.some(v=>v!==0))throw Error('Missing wet texture must have reset dimensions');
 const texture=gl.createTexture();if(!texture)throw Error('Wet overlay GL allocation failed');engine._wetTex=texture;
 // No texImage/texSubImage, binding, timing, wetRect, raster or filter changes.
 // Original upload still chooses exactly (inW+2,inH+2) and restores GL units.
 return{created:true,storageDimensions:[0,0],storageBytes:0,owner:'engine context lifecycle'};
}
