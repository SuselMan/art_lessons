import { watercolorBrushRunsDry, watercolorWaterClock, watercolorWaterLoad, watercolorWaterStep } from '../presets/watercolorPresets'

export type WaterPolicy = 'legacy' | 'finite' | 'bottomless'
export interface SolventSourceClock { waterUsed: number; pigmentUsed: number }
export interface SolventSourceProfile { waterDepletion: boolean; waterLevel: number; pigmentStrength: number }

/** Exact source amplitude used by the own-water raster pass. Geometry and
 * recorded wet contact are supplied by the caller, never PaperWetness clock.
 * Does not rasterize or reconstruct foreign water by itself. */
export function advanceSolventSource(
  clock: SolventSourceClock, profile: SolventSourceProfile,
  segmentLength: number, radius: number, recordedWet: number,
  segmentMode: boolean, policy: WaterPolicy,
): SolventSourceClock & { load: number; water: number } {
  let waterUsed = clock.waterUsed, pigmentUsed = clock.pigmentUsed
  if (profile.waterDepletion) {
    const step = watercolorWaterStep(segmentLength, radius)
    pigmentUsed += step
    waterUsed = watercolorWaterClock(waterUsed, step, recordedWet)
  }
  const spendsWater = segmentMode && policy !== 'legacy'
    ? policy === 'finite' : watercolorBrushRunsDry(profile.pigmentStrength)
  const load = profile.waterDepletion && spendsWater ? watercolorWaterLoad(waterUsed) : 1
  return { waterUsed, pigmentUsed, load, water: profile.waterDepletion ? profile.waterLevel * load : 1 }
}

export interface RasterizedSolventChunk {
  gesture: string
  chunk: string
  /** Monotone barrier identifier: paper_dry/layer_clear begins a new epoch. */
  epoch: number
  done: boolean
  /** Physical source V, produced by the real source pass, not a wet stencil. */
  volume: Float32Array
}

/** CPU reference for an ephemeral import. Not connected to engine rendering.
 * MAX per gesture (including its chunks), ADD across gestures. Does not write
 * either donor's or recipient's persistent solventLoad. */
export function assembleForeignSolvent(
  chunks: readonly RasterizedSolventChunk[], cells: number, epoch: number,
  ownGesture: string, cap = 4,
): Float32Array {
  const gestures = new Map<string, { volume: Float32Array; chunks: Set<string> }>()
  for (const chunk of chunks) {
    if (!chunk.done || chunk.epoch !== epoch || chunk.gesture === ownGesture) continue
    if (chunk.volume.length !== cells) throw new Error('Foreign V raster dimensions differ')
    let gesture = gestures.get(chunk.gesture)
    if (!gesture) {
      gesture = { volume: new Float32Array(cells), chunks: new Set() }
      gestures.set(chunk.gesture, gesture)
    }
    if (gesture.chunks.has(chunk.chunk)) continue
    gesture.chunks.add(chunk.chunk)
    for (let i = 0; i < cells; i++) {
      const v = chunk.volume[i]
      if (!Number.isFinite(v) || v < 0 || v > cap) throw new Error('Invalid physical source V')
      gesture.volume[i] = Math.max(gesture.volume[i], v)
    }
  }
  const result = new Float32Array(cells)
  for (const gesture of gestures.values()) for (let i = 0; i < cells; i++) {
    result[i] = Math.min(cap, result[i] + gesture.volume[i])
  }
  return result
}
