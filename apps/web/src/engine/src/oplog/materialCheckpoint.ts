import {packTilePixels,unpackTilePixels} from '../buffers/pinnedTiles'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import type {CheckpointTile} from './checkpointStore'

export function packColorSmudge(planes: {color:Uint8Array;height:Uint8Array}|undefined):CheckpointTile['colorSmudge'] {
  return planes ? {color:packTilePixels(planes.color),height:packTilePixels(planes.height)} : undefined
}

export function restoreCheckpointMaterial(buffer:AccumulationBuffer,tile:CheckpointTile):void {
  const bytes=tile.width*tile.height*4
  buffer.restoreColorSmudgePixels(tile.width,tile.height,tile.colorSmudge ? {
    color:unpackTilePixels(tile.colorSmudge.color,bytes),height:unpackTilePixels(tile.colorSmudge.height,bytes),
  } : undefined)
}
