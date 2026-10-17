import type { AlgorithmInput } from '../protocol'

/** Readbacks are owned RGBA8 arrays in WebGL bottom-up order, captured before solve. */
export interface NativeRawCapture {
  size: number
  seed: number
  inkColor: Uint8Array
  solvent: Uint8Array
  foreignSolvent?: Uint8Array
  paperHeightRGBA: Uint8Array
  tileOrigin: readonly [number, number]
  paperWorldSize: readonly [number, number]
  paperScale: number
}
export interface ConvertedNativeCapture {
  input: AlgorithmInput
  manifest: {
    version: 1; conversion: 'native-optical-depth-linear'
    rawRows: 'gl-bottom-up'; inputRows: 'top-left'; pigmentScale: number
    nativeMassPerAlpha: 2; nativeDepthPerRGB: 8; nativeWaterPerByteFraction: 4
    saturatedWaterPixels: number; depthWithoutMassPixels: number
    tileOrigin: number[]; paperWorldSize: number[]; paperScale: number
    limitation: string
  }
}
/** Pure CPU conversion. No GL, mutable source references, or image/gamma codecs. */
export function convertNativeCapture(raw: NativeRawCapture): ConvertedNativeCapture {
  const { size } = raw
  if (!Number.isInteger(size) || size < 1 || size > 4096 || !Number.isSafeInteger(raw.seed)) throw Error('Invalid native capture dimensions/seed')
  const bytes = size * size * 4
  for (const plane of [raw.inkColor, raw.solvent, raw.paperHeightRGBA, ...(raw.foreignSolvent ? [raw.foreignSolvent] : [])]) {
    if (!(plane instanceof Uint8Array) || plane.length !== bytes) throw Error('Expected full owned RGBA8 readback')
  }
  if (raw.tileOrigin.length !== 2 || raw.paperWorldSize.length !== 2 || !raw.tileOrigin.every(Number.isFinite) || !raw.paperWorldSize.every(v => Number.isFinite(v) && v > 0) || !Number.isFinite(raw.paperScale) || raw.paperScale <= 0) throw Error('Invalid world paper metadata')
  let maxCode = 0
  for (const code of raw.inkColor) maxCode = Math.max(maxCode, code)
  const pigmentScale = maxCode > 127.5 ? 255 / (2 * maxCode) : 1
  const rgba = new Uint8Array(bytes), water = new Uint8Array(size * size), paper = new Uint8Array(size * size)
  let saturatedWaterPixels = 0, depthWithoutMassPixels = 0
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const src = ((size - 1 - y) * size + x) * 4, pixel = y * size + x, dst = pixel * 4
    const massByte = raw.inkColor[src + 3]!, alpha = Math.round(2 * pigmentScale * massByte)
    rgba[dst + 3] = alpha
    if (massByte === 0) {
      if (raw.inkColor[src]! || raw.inkColor[src + 1]! || raw.inkColor[src + 2]!) depthWithoutMassPixels++
    }
    for (let c = 0; c < 3; c++) rgba[dst + c] = Math.round(2 * pigmentScale * raw.inkColor[src + c]!)
    const sum = raw.solvent[src + 3]! + (raw.foreignSolvent?.[src + 3] ?? 0)
    if (sum > 255) saturatedWaterPixels++
    water[pixel] = Math.min(255, sum)
    paper[pixel] = raw.paperHeightRGBA[src]!
  }
  return { input: { size, seed: raw.seed, encoding: 'optical-density', rgba, water, paper }, manifest: {
    version: 1, conversion: 'native-optical-depth-linear', rawRows: 'gl-bottom-up', inputRows: 'top-left', pigmentScale,
    nativeMassPerAlpha: 2, nativeDepthPerRGB: 8, nativeWaterPerByteFraction: 4,
    saturatedWaterPixels, depthWithoutMassPixels, tileOrigin: [...raw.tileOrigin], paperWorldSize: [...raw.paperWorldSize], paperScale: raw.paperScale,
    limitation: 'Linear optical-depth/mass encoding with one global down-only dose scale and byte quantization; no native deposit/composite equivalence. RGB may exceed A and zero-mass depth is preserved. Paper is separately quantized world-sampled height.'
  } }
}

/** Shader contract for root-owned capture draw; NOT a GL installer or production shader. */
export const NATIVE_PAPER_CAPTURE_FRAG = `precision highp float;
uniform sampler2D u_paperHeightMap;
uniform vec2 u_paperOrigin;
uniform vec2 u_paperTexSize;
uniform vec2 u_paperScale;
void main(){
  float h=texture2D(u_paperHeightMap,(gl_FragCoord.xy+u_paperOrigin)/u_paperTexSize*u_paperScale).r;
  float code=floor(clamp(h,0.0,1.0)*255.0+0.5)/255.0;
  gl_FragColor=vec4(code,0.0,0.0,1.0);
}`
