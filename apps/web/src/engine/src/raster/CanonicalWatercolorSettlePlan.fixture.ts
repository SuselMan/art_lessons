import type { CanonicalSettlePlanContext, SettlePlanScratch, SettlePlanTile } from '../watercolor/SettlePlanContracts'

/** CPU operation trace only: verifies ordering/arguments/ownership, never shader pixels. */
export class TraceBuffer {
  readonly id: number
  readonly width: number
  readonly height: number
  private readonly record: (name: string, args: unknown[]) => void
  constructor(id: number, width: number, height: number, record: (name: string, args: unknown[]) => void) {
    this.id = id; this.width = width; this.height = height; this.record = record
  }
  clear() { this.record('clear', [this]) }
  copyTo(out: TraceBuffer) { this.record('copy', [this, out]) }
  copyRegionInto(out: TraceBuffer, ...rect: number[]) { this.record('region', [this, out, ...rect]) }
  destroy() { this.record('destroy', [this]) }
}
export type TraceTexture = { id: number }
export function traceFixture(half: boolean, mixed: boolean, film: boolean, foreign: boolean, travel: boolean, widthOverride?:number) {
  const events: unknown[][] = []
  let nextBuffer = 0, nextTexture = 0
  const normalize = (value: unknown): unknown => {
    if (value instanceof TraceBuffer) return { buffer: value.id, w: value.width, h: value.height }
    if (value instanceof Uint8Array) {
      let hash = 2166136261
      for (const byte of value) hash = Math.imul(hash ^ byte, 16777619) >>> 0
      return { bytes: value.length, hash }
    }
    if (Array.isArray(value)) return value.map(normalize)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]))
    return value
  }
  const record = (name: string, args: unknown[]) => events.push([name, ...args.map(normalize)])
  const acquire = (w: number, h: number) => {
    const buffer = new TraceBuffer(++nextBuffer, w, h, record)
    record('acquire', [buffer]); return buffer
  }
  const width = widthOverride??(half ? 2048 : 64)
  const tile = acquire(width, width)
  const entry: SettlePlanTile<TraceBuffer> = {
    original: acquire(width, width), coverage: acquire(width, width), inkLoad: acquire(width, width), inkSettled: null,
    inkColor: acquire(width, width), colorSettled: null, strokeInk: acquire(width, width), inkBase: acquire(width, width),
    strokeColor: acquire(width, width), colorBase: acquire(width, width), filmGesture: 0, inkDry: null, colorDry: null,
  }
  const fp = { x: width / 2, y: width / 2, radius: 8, aspect: 1, angle: 0 }
  const scratch: SettlePlanScratch<TraceBuffer> = {
    gesture: 0, materialGesture: 0, paints: new Set(mixed ? ['1,0,0', '0,0,1'] : ['1,0,0']),
    brushTravel: travel ? [{ ...fp, dx: 24, dy: 2, water: 1 }, { ...fp, x: fp.x + 4, dx: -16, dy: 0, water: 1 }] : [],
    wetContacts: foreign ? [fp] : [], foreignSources: foreign ? [{ gesture: 'prior', footprints: [fp] }] : null,
    dryCtx: null, pigmentInputsKnownZero: false, trackRunningSource: false, runningSourceCommands: [],
    peek: b => b === tile ? entry : null,
    *tileEntries() { yield [tile, entry] as [TraceBuffer, SettlePlanTile<TraceBuffer>] },
    releaseRunningCoverage: forget => record('releaseCoverage', [forget]),
    noteStorageBounds: b => record('storage', [b]),
  }
  const fieldFor = (w: number, h: number, captured?: boolean) => {
    record('field', [w, h, captured])
    return { w, h, a: acquire(w, h), b: acquire(w, h), c: acquire(w, h), ca: acquire(w, h), cb: acquire(w, h), cc: acquire(w, h), coverage: acquire(w, h), mask: acquire(w, h), pressure: acquire(w, h), band: acquire(w, h) }
  }
  const passes = {
    diagnosticBrushMrt: false,
    fieldOp: (...args: unknown[]) => record('fieldOp', args),
    pigmentColor: (...args: unknown[]) => record('pigmentColor', args),
    costDomainStep: (...args: unknown[]) => record('costDomain', args),
    waterFrontStep: (...args: unknown[]) => record('front', args),
    diffuseStep: (...args: unknown[]) => record('diffuse', args),
    wcResample: (...args: unknown[]) => record('resample', args),
    brushPass: (...args: unknown[]) => record('brush', args),
    brushPair: (...args: unknown[]) => { record('brushPair', args); return false },
  }
  const context: CanonicalSettlePlanContext<TraceBuffer, TraceTexture> = {
    fieldFor, paperWorldSize: () => ({ w: 256, h: 256 }), pool: () => ({ acquire, release: b => record('release', [b]) }),
    supportsFilm: () => film, ab: () => ({ noDiffuse: false, noCarry: false, opDry: false }), shouldPreview: () => true,
    passes: () => passes,
    uploads: {
      create: () => ({ id: ++nextTexture }), bindFlow: () => {},
      uploadFlow: (_t, w, h, pixels, reuse) => record(reuse ? 'updateFlow' : 'uploadFlow', [w, h, pixels]),
      uploadForeign: (_t, w, h, pixels) => record('uploadForeign', [w, h, pixels]),
      destroy: t => record('deleteTexture', [t]),
    },
  }
  // For generation from the frozen pre-extraction implementation only.
  const gl = {
    TEXTURE0: 0, TEXTURE_2D: 1, TEXTURE_MIN_FILTER: 2, TEXTURE_MAG_FILTER: 3, TEXTURE_WRAP_S: 4, TEXTURE_WRAP_T: 5, LINEAR: 6,
    CLAMP_TO_EDGE: 7, UNPACK_ALIGNMENT: 8, RGBA: 9, LUMINANCE: 10, UNSIGNED_BYTE: 11,
    createTexture: context.uploads.create, activeTexture: () => {}, bindTexture: () => {}, texParameteri: () => {}, pixelStorei: () => {},
    texImage2D: (_target: number, _level: number, format: number, w: number, h: number, _border: number, _format: number, _type: number, pixels: Uint8Array) => record(format === 9 ? 'uploadFlow' : 'uploadForeign', [w, h, pixels]),
    texSubImage2D: (_target: number, _level: number, _x: number, _y: number, w: number, h: number, _format: number, _type: number, pixels: Uint8Array) => record('updateFlow', [w, h, pixels]),
    deleteTexture: context.uploads.destroy,
  }
  const legacyContext = { ...context, gl: () => gl, minmaxExt: () => film ? { MAX_EXT: 32776 } : null }
  return { context, legacyContext, scratch, tile, width, events, record }
}
