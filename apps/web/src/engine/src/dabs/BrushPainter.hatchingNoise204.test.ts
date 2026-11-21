import { expect, it, vi } from 'vitest'
import { BrushPainter, type BrushContext } from './BrushPainter'
import { MockGL } from '../../testing/mockGL'

it('prepares the noise uniforms on the separate hatching program', () => {
  const gl=new MockGL(), lookup=vi.spyOn(gl,'getUniformLocation')
  const painter=new BrushPainter({gl,quadBuf:()=>gl.createBuffer()} as unknown as BrushContext)
  try {
    painter.prepareHatching(true)
    const names=lookup.mock.calls.map(([,name])=>name)
    for(const name of ['u_autoNoiseConfig','u_autoNoiseKey','u_autoNoiseGridX','u_autoNoiseGridY'])expect(names).toContain(name)
  } finally { painter.destroy() }
})
