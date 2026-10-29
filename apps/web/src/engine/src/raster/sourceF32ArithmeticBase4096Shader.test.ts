import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import native from '../presets/fixtures/sourceArmFmaF32/host-fma.native.json'
import proof from './fixtures/sourceF32ArithmeticBase4096/samsung.native.json'
import { SOURCE_F32_ARITHMETIC_BASE4096_GLSL } from './sourceF32ArithmeticBase4096Shader'

it('binds finite add/multiply source and all operand pairs to the actual WebGL1 bit gate', () => {
  const sha = (s: string): string => createHash('sha256').update(s).digest('hex')
  expect(sha(SOURCE_F32_ARITHMETIC_BASE4096_GLSL)).toBe(proof.proof.primitiveSHA256)
  expect(sha(JSON.stringify(native.cases))).toBe(proof.inputCasesSHA256)
  expect(proof.checked).toBe(native.cases.length * 2)
  expect(proof.wrong).toEqual([])
  expect(proof.glError).toBe(0)
  expect(proof.precision.precision).toBeGreaterThanOrEqual(23)
  expect(proof.cleanup.sameOriginalTabs).toBe(true)
  expect(proof.cleanup.ownJobs).toEqual([])
  expect(proof.cleanup.forwardRemoved).toBe(true)
})
