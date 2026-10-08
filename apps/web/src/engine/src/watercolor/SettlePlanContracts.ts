import type { BrushTravel } from './brushDrag'
import type { WaterFootprint, WaterSource } from './foreignWater'

/** Coordinates in this contract remain GL bottom-up. Native adapters convert at the boundary. */
export interface SettlePlanBuffer<B> {
  readonly width: number
  readonly height: number
  clear(): void
  copyTo(out: B): void
  copyRegionInto(out: B, sx: number, sy: number, dx: number, dy: number, width: number, height: number): void
  destroy(): void
}
export interface SettlePlanTarget<B> { buffer: B; originX: number; originY: number; contentRect: { minX: number; minY: number; maxX: number; maxY: number } | null }
export interface SettlePlanField<B> {
  w: number; h: number
  a: B; b: B; c: B; ca: B; cb: B; cc: B
  coverage: B; mask: B; pressure: B; band: B
}
export interface SettlePlanTile<B> {
  original: B; coverage: B; coverageFilm?: B; coverageFilmGesture?: number
  inkLoad: B | null; inkSettled: B | null; inkColor: B | null; colorSettled: B | null
  strokeInk: B | null; inkBase: B | null; strokeColor: B | null; colorBase: B | null
  filmGesture: number; inkDry: B | null; colorDry: B | null
  foreignSolventLoad?: B | null; solventLoad?: B | null; solventBase?: B | null
  strokeSolvent?: B | null; solventGesture?: number
}
export interface SettlePlanMetadata {
  readonly gesture: number
  readonly paints: Set<string>
  readonly brushTravel: BrushTravel[]
  readonly wetContacts: WaterFootprint[]
  readonly foreignSources: WaterSource[] | null
  readonly dryCtx: { bounds: { minX: number; minY: number; maxX: number; maxY: number }; radiusPx: number; standing: number } | null
}
export interface SettlePlanScratch<B> extends SettlePlanMetadata {
  materialGesture: number
  pigmentInputsKnownZero: boolean
  trackRunningSource: boolean
  runningSourceCommands: Array<() => void>
  peek(buffer: B): SettlePlanTile<B> | null
  tileEntries(): IterableIterator<[B, SettlePlanTile<B>]>
  releaseRunningCoverage(forget?: boolean): void
  noteStorageBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number }): void
}
export type SettlePlanRect = [number, number, number, number]
export interface SettlePlanFieldOptions<B> {
  c?: B; d?: B; e?: B; path?: B; scissor?: SettlePlanRect
  dir?: [number, number]; origin?: [number, number]; band?: [number, number]; size?: [number, number]
  tau?: [number, number, number]; world?: [number, number, number]
  gradientFibres?: boolean; pathPacked?: boolean; additiveZeroFaces?: boolean
}
export interface SettlePlanPasses<B, T> {
  diagnosticBrushMrt: boolean
  fieldOp(out: B, a: B, b: B, mode: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20, k: number, options?: SettlePlanFieldOptions<B>): void
  /** Optional diagnostic replacement for adjacent mode16 then15, both reading
   * OLD P/C. Returning false leaves the original calls untouched. */
  carryPair?(outPigment:B,pigment:B,outColor:B,color:B,fixed:B,k:number,options:SettlePlanFieldOptions<B>):boolean
  pigmentColor(out: B, deposit: B, tau: readonly number[]): void
  costDomainStep(out: B, source: B, rect: SettlePlanRect, band: number, stride: number, packed?: boolean): void
  diffuseStep(field: Pick<SettlePlanField<B>, 'w' | 'h' | 'coverage'>, x0: number, y0: number, scale: number, paperWidth: number, paperHeight: number, src: B, dst: B, radius: number, knight: boolean, gate: B, density?: B, solvent?: B | null): void
  wcResample(dst: B, dx: number, dy: number, width: number, height: number, src: B, sx: number, sy: number, ratio: number, mode: 0 | 1 | 2, old?: B | null, base?: B | null, clamp?: SettlePlanRect | null): void
  waterFrontStep(field: Pick<SettlePlanField<B>, 'w' | 'h' | 'coverage'>, x0: number, y0: number, dryCost: number, src: B, dst: B, max: number, climb: number, floor: number, stride?: number, scale?: number, foreignWater?: T | null): void
  brushPass(field: Pick<SettlePlanField<B>, 'w' | 'h' | 'coverage'>, flow: T, radius: number, scale: number, source: B, out: B, pigment: B, rect: SettlePlanRect, scissor: SettlePlanRect, color: B, gain: number): void
  brushPair(field: Pick<SettlePlanField<B>, 'w' | 'h' | 'coverage'>, flow: T, radius: number, scale: number, pigment: B, outPigment: B, color: B, outColor: B, rect: SettlePlanRect, scissor: SettlePlanRect, gain: number): boolean
}
/** Uploads execute in op chronology. Native implementations must encode staging copies,
 * or submit earlier work before writing shared storage. queue.writeTexture alone is unsafe. */
export interface SettlePlanUploads<T> {
  create(): T | null
  bindFlow(texture: T | null, configure: boolean): void
  uploadFlow(texture: T | null, width: number, height: number, pixels: Uint8Array, reuseStorage: boolean): void
  uploadForeign(texture: T | null, width: number, height: number, pixels: Uint8Array): void
  destroy(texture: T | null): void
}
export type SettlePlanPreview<B> = (tile: SettlePlanTarget<B>, pigment: B, color: B | null, coverage: B) => void
export interface CanonicalSettlePlanContext<B, T> {
  fieldFor(w: number, h: number, captureClearsInputs?: boolean): SettlePlanField<B>
  paperWorldSize(): { w: number; h: number }
  pool(): { acquire(w: number, h: number): B; release(buffer: B): void }
  supportsFilm(): boolean
  ab(): { noDiffuse: boolean; noCarry: boolean; opDry: boolean }
  shouldPreview?(): boolean
  gradientFibres?(): boolean
  passes(): SettlePlanPasses<B, T>
  uploads: SettlePlanUploads<T>
}
