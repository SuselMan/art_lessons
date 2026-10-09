import { expect, it } from 'vitest'
import { brushDragField, type BrushTravel } from './brushDrag'
import { brushDragFieldWork } from './brushDragFieldWork'
import { brushDragFieldHoisted } from '../../../../../../docs/qa/harness/728-gl-timing/BrushDragHoisted'

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
