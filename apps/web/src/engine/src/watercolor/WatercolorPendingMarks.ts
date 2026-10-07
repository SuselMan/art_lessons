/** Physical acceptance, rather than solver completion or an animation clock,
 * retires a provisional batch. This index owns metadata only: a renderer must
 * display canonical material independently of these remaining marks. */
export class WatercolorPendingMarks<T> {
  private readonly layers = new Map<string, Map<object, Readonly<T>>>()
  private readonly tokens = new Map<object, string>()
  private readonly dirty = new Set<string>()

  append(layerId: string, mark: Readonly<T>): object {
    const token = {}
    let layer = this.layers.get(layerId)
    if (!layer) { layer = new Map(); this.layers.set(layerId, layer) }
    layer.set(token, mark)
    this.tokens.set(token, layerId)
    this.dirty.add(layerId)
    return token
  }

  /** Called after the matching immutable deposition request really executed.
   * FIFO owns execution order; this class does not infer it from timestamps. */
  accepted(token: object): boolean { return this.remove(token) }

  /** A cancelled unrecorded preview does not delete accepted journal paint. */
  cancelled(token: object): boolean { return this.remove(token) }

  private remove(token: object): boolean {
    const layerId = this.tokens.get(token)
    if (layerId === undefined) return false
    this.tokens.delete(token)
    const layer = this.layers.get(layerId)!
    layer.delete(token)
    if (!layer.size) this.layers.delete(layerId)
    this.dirty.add(layerId)
    return true
  }

  pending(layerId: string): readonly Readonly<T>[] {
    return [...(this.layers.get(layerId)?.values() ?? [])]
  }

  /** Several retirements in a frame invalidate each layer just once. They
   * perform no GPU copy, remaining-mark replay, or global owner release. */
  takeDirtyLayers(): readonly string[] {
    const layers = [...this.dirty]
    this.dirty.clear()
    return layers
  }

  clear(): void {
    for (const id of this.layers.keys()) this.dirty.add(id)
    this.layers.clear()
    this.tokens.clear()
  }
}
