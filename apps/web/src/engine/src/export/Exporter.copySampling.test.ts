import { expect,it } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { Exporter,type ExporterContext } from './Exporter'
it('returns a point-sampled full-resolution composite for its 1:1 finishing pass',()=>{
 const mock=new MockGL(),gl=mock as unknown as WebGLRenderingContext
 const exporter=new Exporter({gl,compositeOrder:()=>[]} as unknown as ExporterContext)
 const composite=exporter.buildContentComposite({x:0,y:0,width:512,height:576})!
 try{
  expect(composite.buffer.width).toBe(512);expect(composite.buffer.height).toBe(576)
  expect(mock.getMinFilter(composite.buffer.texture)).toBe(mock.NEAREST)
 }finally{composite.buffer.destroy()}
})

it('bounds preview allocations while preserving the entire sheet and world scale', () => {
  const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext
  const frames: Array<{ scale: number; centerX: number; centerY: number }> = []
  const exporter = new Exporter({ gl, compositeOrder: () => [{ id: 'L', opacity: 1 }],
    drawLayer: (frame: { scale: number; centerX: number; centerY: number }) => { frames.push(frame) },
  } as unknown as ExporterContext)
  const source = { x: -100, y: 200, width: 4096, height: 5792 }
  const composite = exporter.buildContentComposite(source, 640)!
  try {
    expect(Math.max(composite.buffer.width, composite.buffer.height)).toBe(640)
    expect(composite.bounds.x).toBeLessThanOrEqual(source.x)
    expect(composite.bounds.y).toBeLessThanOrEqual(source.y)
    expect(composite.bounds.x + composite.bounds.width).toBeGreaterThanOrEqual(source.x + source.width)
    expect(composite.bounds.y + composite.bounds.height).toBeGreaterThanOrEqual(source.y + source.height)
    expect(frames[0].scale).toBeCloseTo(composite.buffer.width / composite.bounds.width)
    expect(frames[0].scale).toBeCloseTo(composite.buffer.height / composite.bounds.height)
  } finally { composite.buffer.destroy() }
})
