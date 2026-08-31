import { expect, test } from '@playwright/test'

import { activeLayerId, createRoom, waitForRoomReady } from '../support/room'

/** (#514) The stripe the smudge tool used to leave dead along every tile
 *  seam, measured on a real GPU.
 *
 *  Why this cannot be a MockGL test, when index.smudge.test.ts already covers
 *  the same defect: the fix is two GL primitives the mock only approximates —
 *  `copyTexSubImage2D` assembling one patch out of several tiles, and a
 *  *negative* `u_patchOrigin` on whichever side of the seam the patch started
 *  outside of. A mock that mirrors the intended arithmetic will agree with
 *  the code by construction; a driver need not. So the same measurement is
 *  repeated here against real pixels.
 *
 *  Why the room and not a bare canvas (the way transformSeam.spec.ts drives
 *  its shader directly): the seam's *position* is half the point. Tiles are
 *  TILE_SIZE in a bounded room too, so a default A4 sheet — 1240x1754 — has
 *  one at x=1024 with 216 pixels of paper to its right, and the bug was a
 *  band as wide as the brush running down a real lesson's page. Nothing but a
 *  real room puts the seam there.
 *
 *  The operations are appended through `window.__engine` rather than drawn
 *  with the mouse, because what is being measured is a profile across exact
 *  world coordinates. The camera fits the page at about 0.46x, so a mouse
 *  path would have to be inverted through it, and every probe would land a
 *  couple of world pixels off where the arithmetic says the seam is.
 */
const SEAM = 1024 // TILE_SIZE — the vertical seam on a 1240-wide A4 sheet
const BRUSH = 120 // wide enough that a pre-fix dead band would be 120px across
const BAND_Y = 560 // a solid horizontal band of graphite to drag downward from
const PROBE_Y = 700 // where the dragged-down graphite is read back

test.describe('smudge across a tile seam (#514)', () => {
  test('no dead band at x=TILE_SIZE: the stump drags graphite down at every x', async ({ page }) => {
    await createRoom(page, 'E2E smudge seam')
    await waitForRoomReady(page)
    const layerId = await activeLayerId(page)

    const probeXs: number[] = []
    for (let x = SEAM - 300; x <= SEAM + 180; x += 20) probeXs.push(x)

    const darkness = await page.evaluate(({ layerId, probeXs, SEAM, BRUSH, BAND_Y, PROBE_Y }) => {
      const engine = window.__engine!
      let n = 0
      const dab = (x: number, y: number, size: number) => ({
        x, y, pressure: 1, tiltX: 0, tiltY: 0, size,
        aspectRatio: 1, angle: 0, opacity: 1, t: 0,
      })
      const stroke = (tool: 'pencil' | 'smudge', dabs: ReturnType<typeof dab>[]) => {
        engine.appendOperation({
          id: `e2e-${tool}-${n++}`, type: 'stroke', userId: 'e2e', timestamp: Date.now(),
          layerId, tool, preset: tool === 'pencil' ? '4B' : 'default',
          color: [0.1, 0.1, 0.1], dabs, strokeId: `e2e-gesture-${n}`,
        })
      }

      // A solid band of graphite spanning the seam, thick enough that a
      // downward drag has something to carry for its whole length.
      for (let y = BAND_Y - 40; y <= BAND_Y + 40; y += 10) {
        const dabs = []
        for (let x = SEAM - 380; x <= SEAM + 200; x += 10) dabs.push(dab(x, y, 60))
        stroke('pencil', dabs)
      }

      // One short downward drag per probe column, each its own gesture (its
      // own imprint), so the columns cannot cover for each other: a column
      // whose dabs were all dropped shows up as clean paper even though its
      // neighbours worked. This is the profile that measured 0 across a
      // 100px stripe before the fix.
      for (const x of probeXs) {
        const dabs = []
        for (let y = BAND_Y; y <= PROBE_Y + 40; y += 10) dabs.push(dab(x, y, BRUSH))
        stroke('smudge', dabs)
      }

      return probeXs.map(x => {
        const c = engine.pickColor(x, PROBE_Y)
        return c ? 1 - (c[0] + c[1] + c[2]) / 3 : 0
      })
    }, { layerId, probeXs, SEAM, BRUSH, BAND_Y, PROBE_Y })

    const away = probeXs
      .map((x, i) => ({ x, d: darkness[i] }))
      .filter(({ x }) => Math.abs(x - SEAM) > BRUSH)
    const near = probeXs
      .map((x, i) => ({ x, d: darkness[i] }))
      .filter(({ x }) => Math.abs(x - SEAM) <= BRUSH)

    // Sanity first: the drag has to actually carry graphite where the tool was
    // never broken, or the rest of this measures nothing.
    const awayMedian = [...away.map(p => p.d)].sort((a, b) => a - b)[Math.floor(away.length / 2)]
    expect(awayMedian, `profile: ${darkness.map((d, i) => `${probeXs[i]}:${d.toFixed(3)}`).join(' ')}`)
      .toBeGreaterThan(0.1)

    // The claim: every column within a brush's width of the seam carries
    // graphite too. Before #514 each of these read exactly the paper.
    for (const { x, d } of near) {
      expect(d, `x=${x} is dead (profile: ${darkness.map((v, i) => `${probeXs[i]}:${v.toFixed(3)}`).join(' ')})`)
        .toBeGreaterThan(awayMedian * 0.4)
    }
  })
})
