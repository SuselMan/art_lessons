/** Resource installation boundary; no renderer or GPU is constructed here. */
export { installBrushLibrary, installBrushPixels, clearImportedBrushPixels, retainImportedBrushResources, importedBrushAssets, isBrushAssetReady, importedBrushes } from './src/presets/importedBrushes'

/** Static UI eligibility only; resource and original BEGIN admission stay in engine. */
export {canonicalSourceAuthorAdmission,type CanonicalSourceAuthorAdmission} from './src/presets/sourceCanonicalAuthorAdmission'
