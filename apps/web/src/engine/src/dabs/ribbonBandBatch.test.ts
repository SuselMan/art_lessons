import { describe, expect, it } from 'vitest'
import type { Dab } from '@grafetto/shared'
import { buildRibbonBands, type NibShape } from './markerRibbon'
import { buildRibbonBandBatch, type RibbonBandMaterialFor } from './ribbonBandBatch'

// Recorded final eight codec dabs of standalone Samsung1345; no identity/log metadata.
const final8: { prev: Dab; dabs: Dab[] } = {"prev":{"x":962.9521484375,"y":1381.295166015625,"pressure":0.7201793193817139,"tiltX":0,"tiltY":0,"size":337.8820495605469,"aspectRatio":1,"angle":2.994403600692749,"opacity":0.9900000095367432,"t":5893.10009765625},"dabs":[{"x":981.8637084960938,"y":1383.1864013671875,"pressure":0.048124998807907104,"tiltX":0,"tiltY":0,"size":314.65264892578125,"aspectRatio":1,"angle":2.994403600692749,"opacity":0.9900000095367432,"t":6010.89990234375},{"x":1000.7752685546875,"y":1385.0775146484375,"pressure":0.04125000163912773,"tiltX":0,"tiltY":0,"size":291.42327880859375,"aspectRatio":1,"angle":2.994403600692749,"opacity":0.9900000095367432,"t":6010.89990234375},{"x":1019.686767578125,"y":1386.9686279296875,"pressure":0.03437500074505806,"tiltX":0,"tiltY":0,"size":268.1938781738281,"aspectRatio":1,"angle":2.994403600692749,"opacity":0.9900000095367432,"t":6010.89990234375},{"x":1038.598388671875,"y":1388.85986328125,"pressure":0.027499999850988388,"tiltX":0,"tiltY":0,"size":244.96449279785156,"aspectRatio":1,"angle":2.994403600692749,"opacity":0.9900000095367432,"t":6010.89990234375},{"x":1057.5098876953125,"y":1390.7509765625,"pressure":0.020625000819563866,"tiltX":0,"tiltY":0,"size":221.73509216308594,"aspectRatio":1,"angle":2.994403600692749,"opacity":0.9900000095367432,"t":6010.89990234375},{"x":1076.42138671875,"y":1392.64208984375,"pressure":0.013749999925494194,"tiltX":0,"tiltY":0,"size":198.50570678710938,"aspectRatio":1,"angle":2.994403600692749,"opacity":0.9900000095367432,"t":6010.89990234375},{"x":1095.3330078125,"y":1394.5333251953125,"pressure":0.006874999962747097,"tiltX":0,"tiltY":0,"size":175.2763214111328,"aspectRatio":1,"angle":2.994403600692749,"opacity":0.9900000095367432,"t":6010.89990234375},{"x":1114.2445068359375,"y":1396.4244384765625,"pressure":0,"tiltX":0,"tiltY":0,"size":152.0469207763672,"aspectRatio":1,"angle":2.994403600692749,"opacity":0.9900000095367432,"t":6010.89990234375}]}

const materials: RibbonBandMaterialFor[] = [
  (_a, d, travel) => ({ ink: d.opacity * travel * .137, water: .713, paperWet: .317, strength: .923, puddle: .67, pigmentPool: .49 }),
  (_a, d, travel) => ({ ink: d.opacity * travel * .137, water: .713, paperWet: d.pressure * .27, strength: .923, puddle: .67, pigmentPool: .49 }),
  (_a, d) => ({ ink: d.pressure * .193 / 4, water: 1, paperWet: 0, strength: 0, puddle: 0, pigmentPool: 0 }),
]
function exact(dabs: Dab[], previous: Dab | undefined, shape: NibShape, film: boolean, scale: number) {
  const actual = buildRibbonBandBatch(dabs, scale, previous, shape, .23, .71, materials, film)
  expect(actual.length).toBe(3)
  for (let i = 0; i < materials.length; i++) {
    const baseline = buildRibbonBands(dabs, scale, previous, shape, .23, .71, materials[i], film)
    // Compare encoded Float32 bits, including signed zero, rather than approximate floats.
    expect(Buffer.compare(Buffer.from(actual[i].buffer), Buffer.from(baseline.buffer))).toBe(0)
  }
}
describe('single geometry material batch', () => {
  for (const shape of ['ellipse', 'roundedBox'] as const) for (const film of [false, true]) for (const scale of [.63, 1, 2]) {
    it(`preserves actual final8 all three outputs ${shape}/${film}/${scale}`, () => exact(final8.dabs, final8.prev, shape, film, scale))
    it(`preserves pressure/pose/return/zero-travel ${shape}/${film}/${scale}`, () => {
      const dabs = final8.dabs.map((d, i) => ({ ...d, x: i % 3 * 5, y: i % 2 * -7, angle: i * .61, aspectRatio: .3 + i * .8, pressure: i % 2 ? .01 : .98, size: i % 3 ? 230 : 0, opacity: i % 2 ? -.1 : .937 }))
      dabs[2] = { ...dabs[2], x: dabs[1].x, y: dabs[1].y }
      exact(dabs, undefined, shape, film, scale)
    })
  }
  it('returns three empty outputs for a single pose', () => exact([final8.prev], undefined, 'ellipse', true, 1))
})
