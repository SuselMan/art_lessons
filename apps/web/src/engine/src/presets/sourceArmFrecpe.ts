/** Authored ARM AArch64 FRECPE binary32 value model, FPCR=0 only.
 * Mathematical law: Arm DDI0596 shared FPRecipEstimate/RecipEstimate,
 * official source+hash and actual Samsung instruction receipt in fixtures.
 * No exception flags/traps, FRECPS, increased precision, FZ/DN/AH modes,
 * Krita dispatch, SIMD packet selection or color compositing are implicit.
 * This primitive preserves NaN payload/sign through its raw-bit entry point.
 */
export function arm64ReciprocalEstimateF32Bits(inputBits: number): number {
  if (!Number.isInteger(inputBits) || inputBits < 0 || inputBits > 0xffffffff) throw new RangeError('Expected uint32 binary32 bits')
  const sign = inputBits & 0x80000000
  let exponent = (inputBits >>> 23) & 255
  let fraction = inputBits & 0x7fffff
  if (exponent === 255) return fraction ? (inputBits | 0x400000) >>> 0 : sign >>> 0
  if (exponent === 0) {
    if (fraction < 0x200000) return (sign | 0x7f800000) >>> 0
    // FPCR.FZ=0: normalize the two subnormal exponent bins which do not
    // overflow the reciprocal. Smaller nonzero magnitudes overflow to Inf.
    exponent = 1
    while (fraction < 0x800000) { fraction *= 2; exponent-- }
    fraction &= 0x7fffff
  }
  const bin = 256 + (fraction >>> 15)
  const estimate = Math.floor((Math.floor(524288 / (bin * 2 + 1)) + 1) / 2)
  let resultExponent = 253 - exponent
  let resultFraction = (estimate & 255) << 15
  if (resultExponent <= 0) {
    resultFraction = (0x800000 | resultFraction) >>> (1 - resultExponent)
    resultExponent = 0
  }
  return (sign | (resultExponent << 23) | resultFraction) >>> 0
}

const storage = new DataView(new ArrayBuffer(4))
/** Float32 numeric convenience entry. Raw NaN payloads require the bits API;
 * JS Numbers do not promise preservation of signaling NaN input payloads.
 */
export function arm64ReciprocalEstimateF32(value: number): number {
  storage.setFloat32(0, value, true)
  const result = arm64ReciprocalEstimateF32Bits(storage.getUint32(0, true))
  storage.setUint32(0, result, true)
  return storage.getFloat32(0, true)
}
