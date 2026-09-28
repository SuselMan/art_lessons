import { describe, it, expect, vi } from 'vitest'

import { probeWebGL } from './webgl'

// A canvas that behaves the way Chrome does when acceleration is off: no
// context, and the reason delivered through `webglcontextcreationerror`
// rather than thrown. The probe must have its listener on before it asks.
interface FakeCanvas {
  addEventListener: (type: string, fn: (e: Event) => void) => void
  getContext: () => unknown
}

function fakeDocument(canvas: FakeCanvas): Document {
  return { createElement: () => canvas } as unknown as Document
}

describe('probeWebGL (#570)', () => {
  it('reports the browser’s own reason when the context is refused', () => {
    let listener: ((e: Event) => void) | null = null
    const canvas = {
      addEventListener: (_type: string, fn: (e: Event) => void) => { listener = fn },
      getContext: () => {
        listener?.({ statusMessage: 'GL_RENDERER = Disabled' } as unknown as Event)
        return null
      },
    }
    expect(probeWebGL(fakeDocument(canvas))).toEqual({ ok: false, reason: 'GL_RENDERER = Disabled' })
  })

  it('reports null when the context is refused silently', () => {
    const canvas = { addEventListener: () => {}, getContext: () => null }
    expect(probeWebGL(fakeDocument(canvas))).toEqual({ ok: false, reason: null })
  })

  it('treats a throwing getContext as unavailable', () => {
    const canvas = {
      addEventListener: () => {},
      getContext: () => { throw new Error('no gl here') },
    }
    expect(probeWebGL(fakeDocument(canvas))).toEqual({ ok: false, reason: 'no gl here' })
  })

  it('is ok when a context comes back, and releases it', () => {
    const loseContext = vi.fn()
    const canvas = {
      addEventListener: () => {},
      getContext: () => ({ getExtension: () => ({ loseContext }) }),
    }
    expect(probeWebGL(fakeDocument(canvas))).toEqual({ ok: true })
    expect(loseContext).toHaveBeenCalledOnce()
  })

  it('is ok even when the lose_context extension is missing', () => {
    const canvas = {
      addEventListener: () => {},
      getContext: () => ({ getExtension: () => null }),
    }
    expect(probeWebGL(fakeDocument(canvas))).toEqual({ ok: true })
  })
})
