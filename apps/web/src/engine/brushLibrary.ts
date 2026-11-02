/** Resource installation boundary; no renderer or GPU is constructed here. */
export { installBrushLibrary, installBrushPixels, clearImportedBrushPixels, retainImportedBrushResources, importedBrushAssets, importedBrushAssetMetadata, isBrushAssetReady, importedBrushes } from './src/presets/importedBrushes'

/** Static UI eligibility only; resource and original BEGIN admission stay in engine. */
export {canonicalSourceAuthorAdmission,type CanonicalSourceAuthorAdmission} from './src/presets/sourceCanonicalAuthorAdmission'

export {canonicalPlainAutoGeometryAuthorAdmission,type CanonicalPlainAutoGeometryCapability,type CanonicalPlainAutoGeometryAuthorOptions,type CanonicalPlainAutoGeometryAuthorAdmission} from './src/presets/sourceCanonicalAuthorAdmission'
