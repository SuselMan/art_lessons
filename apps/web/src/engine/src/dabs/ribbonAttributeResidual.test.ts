import { expect, it } from 'vitest'
import type { Dab } from '@grafetto/shared'
import { swapRibbonBandDiagonal } from './ribbonDiagnosticDiagonal'
import { buildRibbonBands, RIBBON_FLOATS_PER_VERTEX as N, type NibShape } from './markerRibbon'
const dab = (x: number, size: number, angle = 0, aspectRatio = 1): Dab => ({ x, y: 0, size, angle, aspectRatio, pressure: 0.8, tiltX: 0, tiltY: 0, opacity: 1, t: x })
// A single plane through triangle 0 predicts the fourth quad corner iff the
// varying has no diagonal-dependent gradient. This is a CPU geometry oracle,
// not evidence that a visible artifact belongs to this varying.
function residual(v: number[][], channel: number): number {
  const [a,b,c] = v, d = v[5], bx=b[0]-a[0], by=b[1]-a[1], cx=c[0]-a[0], cy=c[1]-a[1]
  const det=bx*cy-by*cx
  const gx=((b[channel]-a[channel])*cy-(c[channel]-a[channel])*by)/det
  const gy=(bx*(c[channel]-a[channel])-cx*(b[channel]-a[channel]))/det
  return Math.abs(a[channel]+gx*(d[0]-a[0])+gy*(d[1]-a[1])-d[channel])
}
function measure(shape: NibShape, varying: boolean) {
  const bytes=buildRibbonBands([dab(0,20,0.4,shape==='ellipse'?1:2),dab(40,varying?12:20,0.4,shape==='ellipse'?1:2)],1,undefined,shape,0.15,1,()=>({ink:0.3,water:0.8,paperWet:0.7,strength:1,puddle:0.4,pigmentPool:0.6}))
  const maxima=Array(N).fill(0)
  for(let offset=0;offset<bytes.length;offset+=6*N){const v=Array.from({length:6},(_,i)=>Array.from(bytes.slice(offset+i*N,offset+(i+1)*N)));for(let c=2;c<N;c++)maxima[c]=Math.max(maxima[c],residual(v,c))}
  return maxima
}
it('constant round and chisel bands have affine across coordinates',()=>{
  for(const shape of ['ellipse','roundedBox'] as const)expect(measure(shape,false)[5]).toBeLessThan(1e-6)
})
it('varying-width round and chisel bands have a diagonal-dependent across gradient, not a dose gradient',()=>{
  for(const shape of ['ellipse','roundedBox'] as const){const r=measure(shape,true);expect(r[5]).toBeGreaterThan(0.01);if(shape==='ellipse')expect(r[2]).toBeLessThan(1e-5);for(const c of [3,4,6,7,8,9,10])expect(r[c]).toBeLessThan(1e-6)}
})

it('diagnostic swap preserves every quad corner and changes only the interior diagonal',()=>{
  const input=buildRibbonBands([dab(0,20),dab(40,12)],1)
  const {bands,swapped}=swapRibbonBandDiagonal(input)
  expect(swapped).toBeGreaterThan(0)
  for(let o=0;o<input.length;o+=6*N){
    const vertices=(a:Float32Array)=>new Set(Array.from({length:6},(_,i)=>JSON.stringify(Array.from(a.slice(o+i*N,o+(i+1)*N)))))
    expect(vertices(bands)).toEqual(vertices(input))
  }
  expect(Array.from(bands)).not.toEqual(Array.from(input))
  expect(input).not.toBe(bands)
})
