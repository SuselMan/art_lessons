/// <reference types="@webgpu/types" />
import type { Dab, StrokeOperation } from '@grafetto/shared'

/** Logical GPU fields use row zero at world top. Uploaded paper preserves its
 * raw asset byte ordering; shaders explicitly reproduce the GL paper transform. */
export interface CanonicalGpuField {
  readonly width: number
  readonly height: number
  readonly texture: GPUTexture
  readonly view: GPUTextureView
  readonly format: 'rgba8unorm'
  readonly label: string
}
export interface CanonicalWorldRect { x: number; y: number; width: number; height: number }
export interface CanonicalPaper {
  readonly field: CanonicalGpuField
  readonly origin: readonly [number, number]
  readonly texSize: readonly [number, number]
  readonly scale: number
}
export interface CanonicalGpuContext {
  readonly device: GPUDevice
  readonly encoder: GPUCommandEncoder
  readonly nearest: GPUSampler
  readonly linear: GPUSampler
}
export interface CanonicalWatercolorFields {
  readonly pigment: CanonicalGpuField
  readonly color: CanonicalGpuField
  readonly coverage: CanonicalGpuField
  readonly water: CanonicalGpuField
  readonly flow: CanonicalGpuField
}
/** Uniforms are the production rasterizer's prepared values, not a new dose
 * model. Root Room adapter can forward existing CPU preparation unchanged. */
export interface CanonicalDepositUniforms {
  aaPx: number
  washWater: number
  waterRetain: number
  bristleCombs: number
  bristleInk: number
  tau: readonly [number, number, number]
  worldOrigin: readonly [number, number]
  mottleSeed: readonly [number, number]
  cloudDeposit: number
  granDeposit: number
  poolBlot: number
  useAvailableWater: boolean
}
export interface CanonicalRibbonBatch {
  /** Exact buildRibbonBands output: 11 floats per vertex, triangle list. */
  readonly inkBlend: 'max' | 'add'
  readonly vertices: Float32Array
  readonly uniforms: CanonicalDepositUniforms
}
export interface CanonicalStrokeInput {
  readonly operation: StrokeOperation
  readonly dabs: readonly Dab[]
  readonly ribbons: readonly CanonicalRibbonBatch[]
}
export interface CanonicalPassResources {
  readonly a: CanonicalGpuField
  readonly b: CanonicalGpuField
  readonly c?: CanonicalGpuField
  readonly coverage: CanonicalGpuField
  readonly paper: CanonicalPaper
  readonly out: CanonicalGpuField
  readonly world: CanonicalWorldRect
}
export interface CanonicalGpuSnapshot {
  readonly fields: Readonly<Record<keyof CanonicalWatercolorFields, Uint8Array>>
  readonly width: number
  readonly height: number
}
export type CanonicalSupport = { supported: true; adapter: GPUAdapter } | { supported: false; reason: string }
/** Prepared production RibbonPasses.drawRibbonStamp arguments. */
export interface CanonicalStamp {
 readonly center: readonly [number, number]
 readonly radius: number
 readonly aspect: number
 readonly angle: number
 readonly pressure: number
 readonly opacity: number
 readonly nibShape: 'ellipse' | 'roundedBox'
 readonly cornerRadius: number
 readonly inkEdge: number
 readonly inkWater: number
 readonly paperWet: number
 readonly inkStrength: number
 readonly puddle: number
 readonly pigmentPool: number
 readonly acrossLocal: readonly [number, number]
 readonly inkClip: 0 | 1 | 2
 readonly inkBlend: 'max' | 'add'
 readonly uniforms: CanonicalDepositUniforms
}
