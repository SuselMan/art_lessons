import { DAB_PACK_VERSION, type StrokeLiveData, type StrokeOperation } from '@grafetto/shared'

// Count the existing v1 codec without allocating/decoding float dabs on the
// relay path. Unknown/truncated encodings never prove durable coverage.
function packedCount(packed: unknown): number | undefined {
  if (typeof packed !== 'string') return undefined
  if (DAB_PACK_VERSION !== 1 || !packed.startsWith('1:')) return undefined
  const encoded = packed.slice(2)
  if (encoded.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return undefined
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const last = alphabet.indexOf(encoded[encoded.length - padding - 1] ?? '')
  if (padding === 2 && last % 16 || padding === 1 && last % 4) return undefined
  const bytes = encoded.length / 4 * 3 - padding
  // v1 consists of ten little-endian float32 fields per dab.
  return bytes >= 0 && bytes % 40 === 0 ? bytes / 40 : undefined
}

interface LayerPrefix {
  live: number
  accepted: number
  nextSeq: number
  unknown: boolean
}
interface Ownership {
  boardId: string
  ended: boolean
  unknown: boolean
  layers: Map<string, LayerPrefix>
}

/** Socket-local ownership lasts through ordinary UP until every visible live
 *  prefix has durable coverage. An accepted chunk alone is never pen-up. */
export function createLiveStrokeOwnership() {
  const strokes = new Map<string, Ownership>()
  const layerFor = (stroke: Ownership, layerId: string): LayerPrefix | undefined => {
    if (stroke.unknown) return undefined
    let layer = stroke.layers.get(layerId)
    if (!layer) {
      if (stroke.layers.size >= 128) {
        stroke.unknown = true
        stroke.layers.clear()
        return undefined
      }
      layer = { live: 0, accepted: 0, nextSeq: 0, unknown: false }
      stroke.layers.set(layerId, layer)
    }
    return layer
  }
  const retireIfCovered = (strokeId: string, stroke: Ownership) => {
    if (stroke.ended && !stroke.unknown && [...stroke.layers.values()].every(layer => !layer.unknown && layer.accepted >= layer.live)) {
      strokes.delete(strokeId)
    }
  }
  return {
    reserve: (strokeId: string): { allowed: boolean; evicted?: { strokeId: string; boardId: string } } => {
      if (strokes.has(strokeId) || strokes.size < 128) return { allowed: true }
      for (const [endedId, stroke] of strokes) {
        if (!stroke.ended) continue
        strokes.delete(endedId)
        return { allowed: true, evicted: { strokeId: endedId, boardId: stroke.boardId } }
      }
      return { allowed: false }
    },
    live: (boardId: string, packet: StrokeLiveData) => {
      let stroke = strokes.get(packet.strokeId)
      if (!stroke) {
        stroke = { boardId, ended: false, unknown: false, layers: new Map() }
        strokes.set(packet.strokeId, stroke)
      }
      const layer = layerFor(stroke, packet.layerId)
      if (!layer) return
      const count = packedCount(packet.dabsPacked)
      // Like the receiver, each layer permanently desyncs after a gap/dupe.
      if (stroke.ended || packet.packetSeq !== layer.nextSeq || count === undefined) layer.unknown = true
      if (!layer.unknown && count !== undefined) {
        layer.nextSeq++
        layer.live += count
      }
    },
    accepted: (op: StrokeOperation) => {
      if (!op.strokeId) return
      const stroke = strokes.get(op.strokeId)
      if (!stroke) return
      const layer = layerFor(stroke, op.layerId)
      if (!layer) return
      const count = op.dabs ? op.dabs.length : op.dabsPacked ? packedCount(op.dabsPacked) : 0
      if (count === undefined) layer.unknown = true
      else layer.accepted += count
      retireIfCovered(op.strokeId, stroke)
    },
    end: (strokeId: string) => {
      const stroke = strokes.get(strokeId)
      if (!stroke) return
      stroke.ended = true
      strokes.delete(strokeId)
      strokes.set(strokeId, stroke)
      retireIfCovered(strokeId, stroke)
    },
    forget: (strokeId: string) => { strokes.delete(strokeId) },
    drain: () => {
      const owned = [...strokes].map(([strokeId, stroke]) => ({ strokeId, boardId: stroke.boardId }))
      strokes.clear()
      return owned
    },
  }
}
