import type { Dab } from '@grafetto/shared'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { PreviewTile } from './layerPreviews'
import { watercolorMixFromPreset } from '../presets/watercolorPresets'

interface Stream {
  peerId: string
  strokeId: string
  layerId: string
  received: number
  committed: number
  suppressed: boolean
  dabs: Dab[]
  preset: string
  color: [number, number, number]
  origin: { x: number; y: number }
  buf: AccumulationBuffer | null
}
interface Host {
  gl: WebGLRenderingContext
  width(): number
  height(): number
  origin(): { x: number; y: number }
  paint(buf: AccumulationBuffer, dabs: Dab[], preset: string, color: [number, number, number], origin: { x: number; y: number }): void
}
const keyOf = (peer: string, stroke: string, layer: string) => JSON.stringify([peer, stroke, layer])

/** Decorative live ink only. Never enters material, snapshots or dab claims.
 * Recorded chunks retire exactly their prefix; late live packets cannot bring
 * that prefix back. The real operation always paints every recorded dab. */
export class WatercolorLivePreview {
  private streams = new Map<string, Stream>()
  revision = 0
  constructor(privateHost: Host) { this.host = privateHost }
  private readonly host: Host

  private get(peerId: string, strokeId: string, layerId: string): Stream {
    const key = keyOf(peerId, strokeId, layerId)
    let state = this.streams.get(key)
    if (!state) {
      // Bound pending gestures and late-packet tombstones together.
      while (this.streams.size >= 64) {
        const oldest = this.streams.keys().next().value!
        const old = this.streams.get(oldest)
        if (old) this.release(old)
        this.streams.delete(oldest)
      }
      state = { peerId, strokeId, layerId, received: 0, committed: 0, suppressed: false, dabs: [], preset: '', color: [0, 0, 0], origin: this.host.origin(), buf: null }
      this.streams.set(key, state)
    }
    return state
  }

  append(peerId: string, packet: { strokeId: string; layerId: string; preset: string; color: [number, number, number]; dabs: Dab[] }): void {
    const state = this.get(peerId, packet.strokeId, packet.layerId)
    const skip = Math.min(packet.dabs.length, Math.max(0, state.committed - state.received))
    state.received += packet.dabs.length
    const dabs = packet.dabs.slice(skip)
    if (!dabs.length || state.suppressed) return
    state.preset = packet.preset; state.color = packet.color
    // Each real gesture is chunked at 800 dabs; bounded memory also covers a
    // disconnected author whose stream continues while no commit can arrive.
    if (state.dabs.length + dabs.length > 6400) { state.suppressed = true; this.release(state); return }
    state.dabs.push(...dabs)
    if (!state.buf) {
      let bytes = 0
      for (const item of this.streams.values()) if (item.buf) bytes += item.buf.width * item.buf.height * 4
      if (bytes + this.host.width() * this.host.height() * 4 > 64 * 1024 * 1024) return
      state.buf = new AccumulationBuffer(this.host.gl, this.host.width(), this.host.height())
      state.buf.clear()
      this.paint(state, state.dabs)
    } else this.paint(state, dabs)
  }

  confirm(peerId: string, strokeId: string, layerId: string, count: number): void {
    const state = this.get(peerId, strokeId, layerId)
    const remove = Math.min(state.dabs.length, Math.max(0, state.received - state.committed), count)
    state.committed += count
    if (state.suppressed) {
      if (state.committed >= state.received) state.suppressed = false
      return
    }
    state.dabs.splice(0, remove)
    if (!state.dabs.length) this.release(state)
    else if (state.buf) { state.buf.clear(); this.paint(state, state.dabs) }
  }

  private paint(state: Stream, dabs: Dab[]): void {
    if (!state.buf) return
    const waterOnly = watercolorMixFromPreset(state.preset).pigment <= 0
    const marks = dabs.map(d => ({ ...d, opacity: d.opacity * (waterOnly ? 0.12 : 0.5) }))
    this.host.paint(state.buf, marks, state.preset, waterOnly ? [0.5, 0.5, 0.5] : state.color, state.origin)
    this.revision++
  }
  private release(state: Stream, lost = false): void {
    if (state.buf) this.revision++
    if (!lost) state.buf?.destroy()
    state.buf = null; state.dabs = []
  }
  cancel(peerId: string, strokeId?: string): void {
    for (const [key, state] of this.streams) if (state.peerId === peerId && (!strokeId || state.strokeId === strokeId)) {
      this.release(state); this.streams.delete(key)
    }
  }
  clear(lost = false): void {
    for (const state of this.streams.values()) this.release(state, lost)
    this.streams.clear()
  }
  visible(): Iterable<Stream> { return this.streams.values() }
  tiles(): ReadonlyMap<string, readonly PreviewTile[]> {
    const result = new Map<string, PreviewTile[]>()
    for (const state of this.streams.values()) if (state.buf) {
      const tiles = result.get(state.layerId) ?? []
      tiles.push({ buffer: state.buf, originX: state.origin.x, originY: state.origin.y })
      result.set(state.layerId, tiles)
    }
    return result
  }
}
