// (#663) The room snapshot's wire format and the engine's report on restoring
// one — what the room's network and diagnostics code needs without going
// through PencilEngineAPI: encoding tiles for upload, decoding a downloaded
// snapshot before the engine sees it, and reading the restore audit.
export {
  compressLayerTiles, decodeLayerTiles, decompressLayerTiles, type SnapshotTile,
} from './src/oplog/snapshotCodec'
export { GL_OUT_OF_MEMORY, type SnapshotRestoreAudit } from './src/oplog/snapshotAudit'
