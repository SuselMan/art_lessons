/** Engine sweep paths run before owner cancellation. Never return owned preview targets to engine pool. */
export function guardOwnedPreviewRelease(original,getPreview){
 return function(field){const preview=getPreview();if(preview?.ownsPending(field)){preview.retirePending(field);return}return original.call(this,field)}
}
