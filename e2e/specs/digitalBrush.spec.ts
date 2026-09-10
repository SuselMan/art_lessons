import { expect, test } from '@playwright/test'

import { activeLayerId, createRoom, waitForRoomReady } from '../support/room'

/** (#547, ADR 013) The digital brush, measured on a real GPU.
 *
 *  Why this cannot be a MockGL test, when index.digitalBrush.test.ts already
 *  covers the wiring: the mock never rasterizes DAB_FRAG. It applies a plain
 *  graphite-style "over" whatever u_inkMode says, so the soft brush and the ink
 *  brush come out of it identical, and the flow/opacity split — the whole
 *  architectural claim of ADR 013 §3 — is invisible there. Those unit tests say
 *  as much at their top, and this file is the other half they point at.
 *
 *  Operations are appended through `window.__engine` rather than drawn with the
 *  mouse, for the reason smudgeSeam.spec.ts gives: the camera fits the page at
 *  about 0.46x, so a mouse path would have to be inverted through it and every
 *  probe would land a couple of world pixels off what the arithmetic says. The
 *  pointer→dab path is not what is under test here; the shader is.
 */
const LEFT = 300
const RIGHT = 900
const SOFT_Y = 500
const INK_Y = 900
const BRUSH = 120

interface Probe { x: number; y: number }

function darkness(c: [number, number, number] | null): number {
  return c ? 1 - (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) : 0
}

/** How many world px of a profile sit between a fifth and four fifths of its own
 *  peak — the width of the mark's ramp, normalized away from how dark the brush
 *  happens to draw.
 *
 *  Against the profile's own peak rather than an absolute tone, because a soft
 *  brush at the same flow is genuinely paler in the middle, and a fixed
 *  threshold would end up measuring that instead of the edge. */
function rampWidth(profile: number[]): number {
  const peak = Math.max(...profile)
  if (peak <= 0.02) return 0
  return profile.filter(v => v > peak * 0.2 && v < peak * 0.8).length
}

test.describe('digital brush (#547, ADR 013)', () => {
  test('hardness genuinely changes the edge, and it scales with the mark', async ({ page }) => {
    await createRoom(page, 'E2E digital brush')
    await waitForRoomReady(page)
    const layerId = await activeLayerId(page)

    const probes: Probe[] = []
    // A vertical cut through the middle of each band, reaching a full brush
    // width either side so the whole falloff is inside the sample.
    for (let dy = -BRUSH; dy <= BRUSH; dy++) probes.push({ x: (LEFT + RIGHT) / 2, y: SOFT_Y + dy })
    for (let dy = -BRUSH; dy <= BRUSH; dy++) probes.push({ x: (LEFT + RIGHT) / 2, y: INK_Y + dy })

    const raw = await page.evaluate(({ layerId, probes, LEFT, RIGHT, SOFT_Y, INK_Y, BRUSH }) => {
      const engine = window.__engine!
      const dab = (x: number, y: number) => ({
        x, y, pressure: 1, tiltX: 0, tiltY: 0, size: BRUSH,
        aspectRatio: 1, angle: 0, opacity: 1, t: 0,
      })
      const band = (brush: string, y: number, n: number) => {
        const dabs = []
        // Stepped at the brush's own authored spacing so the band is what the
        // tool would actually lay down, not a row of separated stamps.
        for (let x = LEFT; x <= RIGHT; x += BRUSH * 0.06) dabs.push(dab(x, y))
        engine.appendOperation({
          id: `e2e-brush-${n}`, type: 'stroke', userId: 'e2e', timestamp: Date.now(),
          layerId, tool: 'digitalBrush', preset: brush,
          color: [0.1, 0.1, 0.1], dabs, strokeId: `e2e-gesture-${n}`,
        })
      }
      band('brush:soft-round@1', SOFT_Y, 1)
      band('brush:ink-round@1', INK_Y, 2)
      return probes.map(p => engine.pickColor(p.x, p.y))
    }, { layerId, probes, LEFT, RIGHT, SOFT_Y, INK_Y, BRUSH })

    const all = raw.map(c => darkness(c as [number, number, number] | null))
    const soft = all.slice(0, BRUSH * 2 + 1)
    const ink = all.slice(BRUSH * 2 + 1)

    // Both marks are there at all. Asserted first and separately, so a tool that
    // paints nothing fails saying exactly that rather than with a ratio of two
    // zeroes.
    expect(Math.max(...soft), `soft profile: ${soft.map(v => v.toFixed(2)).join(' ')}`).toBeGreaterThan(0.05)
    expect(Math.max(...ink), `ink profile: ${ink.map(v => v.toFixed(2)).join(' ')}`).toBeGreaterThan(0.05)

    // The claim. hardness 0.12 against 0.94 — the soft brush's falloff spreads
    // over most of its radius, the ink brush's over a few pixels at the rim.
    // A factor of two is far outside anything the paper's own grain or the
    // rounding of a sample grid could produce; the measured gap is much larger.
    //
    // What this does **not** pin, stated because it was checked rather than
    // assumed: it is not proof that the mark came from u_inkMode=10. The
    // graphite path reads `hardness` for its own soft profile too, so routing
    // this tool off the coverage path entirely leaves this assertion green. Its
    // job is narrower and still worth having — that the brushes in the set
    // genuinely differ in the axis the set is built on, rather than four names
    // for one mark. The test below is the one that pins the tool.
    expect(
      rampWidth(soft),
      `soft ramp ${rampWidth(soft)}px vs ink ramp ${rampWidth(ink)}px`,
    ).toBeGreaterThan(rampWidth(ink) * 2)
  })

  test('paints at the opacity it was asked for, not at whatever the dabs sum to', async ({ page }) => {
    await createRoom(page, 'E2E digital brush flow')
    await waitForRoomReady(page)
    const layerId = await activeLayerId(page)

    // The sharp test of ADR 013 §3, and the one that fails the moment flow and
    // opacity are collapsed into one number.
    //
    // Why *this* measurement and not "does a self-crossing darken", which was
    // the obvious first attempt and is worthless: dab spacing is a tenth of the
    // brush, so a pixel is under about ten stamps on the first pass alone. A
    // per-dab source-over brush at 35% therefore reaches 1 - 0.65^10 ~ 0.98
    // before it doubles back on anything — it is already saturated, so crossing
    // itself changes nothing and the comparison stays green while the tool is
    // wrong. Verified by breaking it on purpose: routing this tool off the
    // coverage path entirely left that assertion passing.
    //
    // What that broken tool cannot do is come out *pale*. With flow accumulating
    // in the stroke's own coverage buffer and opacity applied once to the
    // finished silhouette, a 35% stroke reads at 35% of a 100% one. Summed per
    // dab, both read the same near-black.
    const Y_FULL = 500
    const Y_PALE = 800
    const PALE = 0.35

    const read = await page.evaluate(({ layerId, LEFT, RIGHT, BRUSH, Y_FULL, Y_PALE, PALE }) => {
      const engine = window.__engine!
      const band = (y: number, opacity: number, n: number) => {
        const dabs = []
        for (let x = LEFT; x <= RIGHT; x += BRUSH * 0.1) {
          dabs.push({
            x, y, pressure: 1, tiltX: 0, tiltY: 0, size: BRUSH,
            aspectRatio: 1, angle: 0, opacity, t: 0,
          })
        }
        engine.appendOperation({
          id: 'e2e-brush-op-' + n, type: 'stroke', userId: 'e2e', timestamp: Date.now(),
          layerId, tool: 'digitalBrush', preset: 'brush:hard-round@1',
          color: [0.1, 0.1, 0.1], dabs, strokeId: 'e2e-gesture-' + n,
        })
      }
      band(Y_FULL, 1, 1)
      band(Y_PALE, PALE, 2)
      const dark = (x: number, y: number): number => {
        const c = engine.pickColor(x, y)
        return c ? 1 - (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) : 0
      }
      const mid = (LEFT + RIGHT) / 2
      const core = (y: number): number => {
        let best = 0
        for (let dy = -4; dy <= 4; dy++) best = Math.max(best, dark(mid, y + dy))
        return best
      }
      // Paper well clear of both bands, so the tones below can be read against
      // the sheet rather than against zero — blank paper here is not white.
      return { full: core(Y_FULL), pale: core(Y_PALE), paper: dark(mid, (Y_FULL + Y_PALE) / 2) }
    }, { layerId, LEFT, RIGHT, BRUSH, Y_FULL, Y_PALE, PALE })

    const fullInk = read.full - read.paper
    const paleInk = read.pale - read.paper
    const detail = 'full ' + read.full.toFixed(3) + ', pale ' + read.pale.toFixed(3)
      + ', paper ' + read.paper.toFixed(3)

    expect(fullInk, detail).toBeGreaterThan(0.05)

    // Measured, not chosen. Correct: 0.796 full, 0.322 pale over 0.035 paper —
    // a ratio of 0.376 against the 0.35 that was asked for. Broken on purpose
    // (this tool routed off the coverage path, so every dab composites
    // source-over on its own): 0.714 pale against 0.792 full, a ratio of 0.896.
    // The two states are nowhere near each other, and the bounds sit in the gap.
    //
    // Wide bounds all the same: the exact figure depends on where the
    // composite's alpha lands in an 8-bit buffer and on paper showing through a
    // nearly-saturated coverage, and pinning it to 0.35 would be a test of
    // arithmetic nobody promised. What is asserted is the shape of the model —
    // ask for a third of the ink, get roughly a third, and emphatically not all.
    expect(paleInk / fullInk, detail).toBeGreaterThan(0.15)
    expect(paleInk / fullInk, detail).toBeLessThan(0.6)
  })
})
