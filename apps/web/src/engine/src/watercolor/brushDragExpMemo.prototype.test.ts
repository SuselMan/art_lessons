import { expect, it } from 'vitest'
import { brushDragField, BrushDragRasterWorkspace, type BrushTravel } from './brushDrag'
import { brushDragFieldWork } from './brushDragFieldWork'
import { brushDragFieldExpMemo as brushDragFieldHoisted } from '../../../../../../docs/qa/harness/728-gl-timing/BrushDragExpMemo'

it('preserves exact field bytes across deterministic adverse inputs and the unchanged generator oracle', () => {
  let seed = 728
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
  for (let n = 0; n < 64; n++) {
    const travel: BrushTravel[] = Array.from({ length: n % 9 }, (_, i) => ({
      x: random() * 70 - 20, y: random() * 50 - 15,
      radius: [0, .1, 2, 20, 200][i % 5], aspect: [.001, .5, 1, 2][i % 4],
      angle: (random() - .5) * Math.PI * 4,
      dx: i % 3 === 0 ? .009 : (random() - .5) * 80,
      dy: i % 3 === 0 ? 0 : (random() - .5) * 80,
      water: [0, 1e-10, .1, .8, 1][i % 5],
    }))
    const rect = { x: random() * -25, y: random() * -30, w: 1 + random() * 80, h: 1 + random() * 60 }
    const cell = [1, 4, 7][n % 3]
    const expected = brushDragField(travel, rect, cell)
    expect(brushDragFieldHoisted(travel, rect, cell)).toEqual(expected)
    const work = brushDragFieldWork(travel, rect, cell)
    let result = work.next(); while (!result.done) result = work.next()
    expect(result.value).toEqual(expected)
  }
})

it('preserves signed zero, finite extreme scale and zero-dose expression behavior', () => {
  const rect={x:-0,y:-.125,w:37,h:23}
  for(const radius of [.5,1e-150,1e150])for(const angle of [-0,1e-150,1e12])for(const water of [-0,0,1e-150,1]){
    const travel=[{x:-0,y:.25,radius,aspect:.5,angle,dx:-0,dy:32,water},
      {x:3,y:-0,radius,aspect:2,angle:-angle,dx:-32,dy:-0,water}]
    const expected=brushDragField(travel,rect)
    expect(brushDragFieldHoisted(travel,rect)).toEqual(expected)
    const work=brushDragFieldWork(travel,rect)
    let result=work.next();while(!result.done)result=work.next()
    expect(result.value).toEqual(expected)
  }
})

it('preserves workspace reuse and retained payload independence', () => {
  const workspace = new BrushDragRasterWorkspace()
  const travel = [{x:16,y:16,radius:20,aspect:1.3,angle:.7,dx:8,dy:-3,water:.8}]
  const retained: Uint8Array[] = []
  for (const size of [32,16,48,16]) {
    const rect={x:0,y:0,w:size,h:size}
    const field=brushDragFieldHoisted(travel,rect,4,workspace)!
    expect(field).toEqual(brushDragField(travel,rect))
    retained.push(field.pixels)
  }
  expect(workspace.reuses).toBe(2)
  expect(new Set(retained.map(p => p.buffer)).size).toBe(4)
  expect(retained[0]).toEqual(brushDragField(travel,{x:0,y:0,w:32,h:32})!.pixels)
})

// Unsupported/nonfinite arithmetic follows the original direct Math.exp route.
it('preserves nonfinite and signed-zero native arithmetic',()=>{
 for(const water of [NaN,Infinity,-Infinity,-0,0]){
  const travel=[{x:8,y:8,radius:8,aspect:1,angle:-0,dx:1,dy:0,water}]
  expect(brushDragFieldHoisted(travel,{x:0,y:0,w:16,h:16})).toEqual(brushDragField(travel,{x:0,y:0,w:16,h:16}))
 }
})
