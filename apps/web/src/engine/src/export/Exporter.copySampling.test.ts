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
