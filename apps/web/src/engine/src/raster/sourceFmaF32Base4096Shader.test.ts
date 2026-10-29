import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import host from '../presets/fixtures/sourceArmFmaF32/host-fma.native.json'
import physical from '../presets/fixtures/sourceArmFmaF32/actual-frecps.native.json'
import proof from './fixtures/sourceFmaF32Base4096/samsung.native.json'
import { SOURCE_FMA_F32_BASE4096_GLSL } from './sourceFmaF32Base4096Shader'
const sha = (s: string): string => createHash('sha256').update(s).digest('hex')
describe('sourceFmaF32Base4096Shader independent device gate', () => {
  it('binds the GLSL source and both independent expected corpora to actual WebGL1 results', () => {
    expect(sha(SOURCE_FMA_F32_BASE4096_GLSL)).toBe(proof.primitiveSHA256)
    for (const [i, corpus] of [host, physical].entries()) {
      expect(corpus.cases).toHaveLength(proof.corpora[i].count)
      expect(sha(JSON.stringify(corpus.cases))).toBe(proof.corpora[i].casesSHA256)
      expect(proof.valueRuns[i].checked).toBe(corpus.cases.length)
      expect(proof.valueRuns[i].wrong).toEqual([])
      expect(proof.valueRuns[i].glError).toBe(0)
    }
    expect(proof.version).toContain('WebGL 1.0')
    expect(proof.precision.precision).toBeGreaterThanOrEqual(23)
  })
  it('keeps the per-pixel ABBA image proof and resource cleanup separate from timing claims', () => {
    expect(proof.perf.proof.width).toBe(64)
    expect(proof.perf.proof.height).toBe(64)
    expect(proof.perf.trials.map(t => t.name)).toEqual(['byte80', 'base4096', 'base4096', 'byte80'])
    for (const t of proof.perf.trials) { expect(t.wrong).toBe(0); expect(t.maxDelta).toBe(0) }
    expect(proof.cleanup.sameOriginalTabs).toBe(true)
    expect(proof.cleanup.ownJobs).toEqual([])
  })
})
