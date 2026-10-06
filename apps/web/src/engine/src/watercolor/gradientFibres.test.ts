import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import type { WatercolorPasses } from '../raster/WatercolorPasses'
import { WC_FIELD_OP_FRAG, WC_FIELD_OP_HIGH_FRAG, WC_FIELD_OP_CARRY_FRAG, WC_FIELD_OP_CARRY_COLOUR_FRAG } from '../raster/shaders'
import { GRADIENT_FIBRE_GLSL, withGradientFibres } from './gradientFibres'

describe('optional baked gradient fibres', () => {
  it('preserves the four frozen OFF shader strings exactly', () => {
    // Combined ring baseline efe5dea9; fibre integration leaves shaders.ts byte-identical.
    const expected = [
      '68be1a68251727abd3b06849903c6c2050fdfaecb078f0f0fdbf1e713d0ade1f',
      '4d87a6d4afca39acf0681e2304f7517b7f19397b62d4aa74fd6e17fa0e31c020',
      '0b28e2c3a464c1aabd92d4a31a1631dd170c7136d335895df0bf6bbcf961c486',
      'd7ab8fcd84686fc2401edc5e702445d130b4f4a9e9181d9d2cb5cb635613be50',
    ]
    const actual = [WC_FIELD_OP_FRAG, WC_FIELD_OP_HIGH_FRAG, WC_FIELD_OP_CARRY_FRAG, WC_FIELD_OP_CARRY_COLOUR_FRAG]
      .map(s => createHash('sha256').update(s).digest('hex'))
    expect(actual).toEqual(expected)
  })

  it('changes only the fibre helper, retaining halo and physical arithmetic', () => {
    const start = WC_FIELD_OP_FRAG.indexOf('  float wcFibre(vec2 wp, vec2 radial) {')
    const end = WC_FIELD_OP_FRAG.indexOf('  #define WC_FIELD_FIT', start)
    const result = withGradientFibres(WC_FIELD_OP_FRAG)
    expect(result.replace(GRADIENT_FIBRE_GLSL, WC_FIELD_OP_FRAG.slice(start, end))).toBe(WC_FIELD_OP_FRAG)
    expect(GRADIENT_FIBRE_GLSL).not.toContain('wcRimHash')
    expect(GRADIENT_FIBRE_GLSL).toContain('u_wcFibreNoiseTex')
    expect(() => withGradientFibres('wrong seam')).toThrow('seam changed')
  })

  it('allocates no optional program by default and caches explicit warming', () => {
    const { engine } = createTestEngine()
    const passes = (engine as unknown as { _watercolorPasses: WatercolorPasses })._watercolorPasses
    const probe = passes as unknown as { _gradientField: { program: WebGLProgram } | null }
    expect(probe._gradientField).toBeNull()
    passes.warmGradientFibres()
    const cached = probe._gradientField
    passes.warmGradientFibres()
    expect(probe._gradientField).toBe(cached)
    engine.destroy()
    expect(probe._gradientField).toBeNull()
  })

  it('unbinds and retires an optional program before reinitialization', () => {
    const { engine } = createTestEngine()
    const passes = (engine as unknown as { _watercolorPasses: WatercolorPasses })._watercolorPasses
    const probe = passes as unknown as { _gradientField: { program: WebGLProgram } | null }
    passes.warmGradientFibres()
    const program = probe._gradientField!.program
    const gl = (engine as unknown as { gl: WebGLRenderingContext }).gl
    const deleted = vi.spyOn(gl, 'deleteProgram')
    gl.useProgram(program)
    passes.initFieldPrograms()
    expect(probe._gradientField).toBeNull()
    expect(deleted).toHaveBeenCalledWith(program)
    expect(gl.getParameter(gl.CURRENT_PROGRAM)).not.toBe(program)
    deleted.mockRestore()
    engine.destroy()
  })
})

// The opt-in belongs only to late wet deposition. Both coupled records receive
// it, while the water-poor dry control never reaches the optional program.
for (const wet of [0, 1]) it(`routes gradient fibres only to late wet slices (wet=${wet})`, async () => {
  const { RibbonStrokeScratch } = await import('../buffers/RibbonStrokeScratch')
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const probe = engine as unknown as {
    _wcGradientFibres: boolean
    _ribbonScratchPool: import('../buffers/RibbonScratchPool').RibbonScratchPool
    _watercolorPasses: WatercolorPasses
    _settlePlan: import('../raster/WatercolorSettlePlan').WatercolorSettlePlan
  }
  probe._wcGradientFibres = true
  const tile = probe._ribbonScratchPool.acquire(64, 64)
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  scratch.getOrCreate(tile)
  scratch.paints.add('1,0,0'); scratch.paints.add('0,0,1')
  const spy = vi.spyOn(probe._watercolorPasses, 'fieldOp')
  try {
    const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
      { minX: 20, minY: 20, maxX: 44, maxY: 44 }, 0.2, 8, wet ? 1 : 0.1, wet, wet ? 1 : 0.1, wet)
    expect(plan).not.toBeNull()
    for (const op of plan!.ops) op()
    plan!.finish()
    const gradient = spy.mock.calls.filter(c => c[5]?.gradientFibres)
    expect(gradient.length).toBe(wet ? 8 : 0)
    for (const call of gradient) {
      expect(call[3]).toBe(1)
      expect(call[5]?.world?.[2]).toBeGreaterThan(0)
      expect(call[5]?.d).toBeDefined()
    }
  } finally {
    spy.mockRestore(); scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy()
  }
})
