import { describe, expect, it, vi } from 'vitest'
import type { Dab } from '@grafetto/shared'
import { WatercolorLivePreview } from './WatercolorLivePreview'

vi.mock('../buffers/AccumulationBuffer', () => ({ AccumulationBuffer: class {
  width: number; height: number
  clear = vi.fn(); destroy = vi.fn()
  constructor(_gl: unknown, width: number, height: number) { this.width = width; this.height = height }
} }))
const dab = (x: number): Dab => ({x,y:10,pressure:1,tiltX:0,tiltY:0,size:10,aspectRatio:1,angle:0,opacity:1,t:0})
const packet = (xs: number[], strokeId = 's') => ({strokeId,layerId:'L',preset:'normal:100:50:PB29:round:wc@m70-r2-v1',color:[0,0,1] as [number,number,number],dabs:xs.map(dab)})
function setup() {
  const paint=vi.fn()
  const preview=new WatercolorLivePreview({gl:{} as WebGLRenderingContext,width:()=>128,height:()=>128,origin:()=>({x:0,y:0}),paint})
  return {preview,paint,states:()=>[...preview.visible()]}
}
describe('watercolor live presentation is separate from canonical material',()=>{
  it('shows packets immediately and retires only the recorded chunk prefix',()=>{
    const {preview,paint,states}=setup()
    preview.append('a',packet([1,2,3,4]))
    expect(paint).toHaveBeenCalledOnce()
    expect(states()[0].buf).not.toBeNull()
    preview.confirm('a','s','L',2)
    expect(states()[0].dabs.map(d=>d.x)).toEqual([3,4])
    expect(paint.mock.lastCall![1].map((d:Dab)=>d.x)).toEqual([3,4])
    preview.confirm('a','s','L',2)
    expect(states()[0].buf).toBeNull()
    preview.clear()
  })
  it('does not resurrect packets overtaken by their recorded operation',()=>{
    const {preview,paint,states}=setup()
    preview.confirm('a','s','L',3)
    preview.append('a',packet([1,2]))
    expect(paint).not.toHaveBeenCalled()
    preview.append('a',packet([3,4,5]))
    expect(states()[0].dabs.map(d=>d.x)).toEqual([4,5])
    preview.confirm('a','s','L',2)
    expect(states()[0].buf).toBeNull()
    preview.clear()
  })
  it('isolates two authors and consecutive gestures through cancellation',()=>{
    const {preview,states}=setup()
    preview.append('a',packet([1]));preview.append('b',packet([2]));preview.append('a',packet([3],'next'))
    preview.cancel('a','s')
    expect(states().map(s=>[s.peerId,s.strokeId])).toEqual([['b','s'],['a','next']])
    preview.cancel('a')
    expect(states().map(s=>s.peerId)).toEqual(['b'])
    preview.clear()
  })
  it('makes water without pigment visible as gray without changing received dabs',()=>{
    const {preview,paint}=setup()
    const p={...packet([1]),preset:'normal:100:0:PB29:round:wc@m70-r2-v1'}
    preview.append('a',p)
    expect(paint.mock.lastCall![3]).toEqual([0.5,0.5,0.5])
    expect(paint.mock.lastCall![1][0].opacity).toBe(0.12)
    expect(p.dabs[0].opacity).toBe(1)
    preview.clear()
  })
  it('forgets lost GL handles without deleting them',()=>{
    const {preview,states}=setup();preview.append('a',packet([1]))
    const buf=states()[0].buf!
    preview.clear(true)
    expect(buf.destroy).not.toHaveBeenCalled()
    expect(states()).toEqual([])
  })
  it('bounds unrecorded material and stream bookkeeping',()=>{
    const {preview,states}=setup()
    for(let i=0;i<80;i++)preview.append('a',packet([i],String(i)))
    expect(states()).toHaveLength(64)
    preview.append('a',packet(Array.from({length:6401},(_,i)=>i),'huge'))
    expect(states().find(s=>s.strokeId==='huge')!.buf).toBeNull()
    expect(states().find(s=>s.strokeId==='huge')!.dabs).toHaveLength(0)
    preview.clear()
  })
})
