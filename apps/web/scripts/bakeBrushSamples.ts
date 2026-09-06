/* Bakes one sample stroke per digital brush into
 * `src/assets/tool-types/digitalBrush/<id>.png` (#547).
 *
 * Why a browser and not a node script like the paper and icon bakes: the mark
 * these images show is made by a WebGL shader, and the only honest picture of a
 * brush is the brush's own output. Reimplementing the stamp in a 2D canvas to
 * avoid the browser would produce a picture that drifts from the tool the day
 * anyone tunes it — which is exactly the objection that got the previous
 * preview (a plotted falloff curve) replaced.
 *
 * Why real pointer input rather than appending operations: `Dab.size` is
 * already through the brush's pressure curve by the time an operation carries
 * it, so a script that appends dabs has to duplicate those curves — a third
 * copy of numbers that are supposed to live in one file. Driving the pen
 * through CDP (`Input.dispatchMouseEvent` with `pointerType: 'pen'` and
 * `force`) makes the engine do all of it: the size curve, the flow curve, the
 * spacing, the smoothing. The sample is then literally a stroke somebody drew.
 *
 * Requires a running dev stack (frontend + backend) — it opens the real app and
 * makes a real room. Point it elsewhere with `--url`.
 *
 *   npm run bake:brush-samples --workspace=apps/web
 *   npm run bake:brush-samples --workspace=apps/web -- --url https://localhost:5173
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, type Page } from '@playwright/test'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(HERE, '..', 'src', 'assets', 'tool-types', 'digitalBrush')

/** Matches the other sample-stroke assets (pencil grades, charcoal types). */
const OUT_W = 512
const OUT_H = 80

/** The world rect the stroke is drawn into, then cropped from. Twice the output
 *  size on both axes: the downscale is what gives the saved PNG its smooth
 *  edges, which matters most for the softest brush in the set. */
const BAND_W = OUT_W * 2
const BAND_H = OUT_H * 2

const BRUSHES = ['soft-round', 'medium-round', 'hard-round', 'ink-round', 'opaque-paint', 'flat']

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

async function createRoom(page: Page, url: string): Promise<void> {
  await page.goto(url + '/create')
  await page.locator('form input[type="text"]').first().fill('Brush samples')
  await page.locator('form button[type="submit"]').first().click()
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas')
    return !!window.__engine && !!canvas && getComputedStyle(canvas).pointerEvents !== 'none'
  }, undefined, { timeout: 60_000 })
}

async function main(): Promise<void> {
  const url = arg('url', 'https://localhost:5173')
  const browser = await chromium.launch()
  // The dev server serves https with a mkcert certificate the bundled browser
  // has never heard of.
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 1000 } })
  const page = await context.newPage()
  await page.addInitScript(() => { localStorage.setItem('al_locale', 'en') })

  const cdp = await context.newCDPSession(page)

  mkdirSync(OUT_DIR, { recursive: true })

  for (const id of BRUSHES) {
    await createRoom(page, url)

    // Where the canvas sits on screen, and how world px map onto it — the stroke
    // is described in world coordinates (that is what the crop is taken in) and
    // has to be drawn in screen ones. Re-measured per room: the layout is the
    // same every time, but reading it is cheap and assuming it is a trap.
    const box = await page.locator('canvas').first().boundingBox()
    if (!box) throw new Error('bake: the canvas has no box')
    const sheet = await page.evaluate(() => {
      const room = window.__roomStore!.getState().room
      return room ? { w: room.width, h: room.height } : null
    })
    if (!sheet) throw new Error('bake: no room in the store')
    // The camera opens fitted, so one world px is this many screen px.
    const scale = Math.min(box.width / sheet.w, box.height / sheet.h)
    const originX = box.x + (box.width - sheet.w * scale) / 2
    const originY = box.y + (box.height - sheet.h * scale) / 2
    const toScreen = (wx: number, wy: number) => ({ x: originX + wx * scale, y: originY + wy * scale })

    const bandX = (sheet.w - BAND_W) / 2
    const bandY = (sheet.h - BAND_H) / 2
    await page.evaluate(brush => {
      const store = window.__roomStore!.getState()
      store.setToolSetting('digitalBrush', 'brush', brush)
      store.setToolSetting('digitalBrush', 'opacity', 1)
      // Sized to the band rather than to taste: the mark has to fill the strip
      // without touching its edges, whichever brush is in hand — and since the
      // slider names the widest the mark gets (digitalBrushPresetFor), one
      // number is right for the round tips and the flat one alike.
      store.setToolSetting('digitalBrush', 'size', 96)
      store.setToolSetting('digitalBrush', 'color', [0.1, 0.1, 0.12])
      store.setTool('digitalBrush')
    }, id)
    // The tool reaches the engine through an effect, not the store write.
    await page.waitForTimeout(250)

    // One gesture for all six, so the picker's rows are comparable: a gentle S
    // with pressure running from a feather touch to full weight. It shows the
    // three things that separate these brushes — the edge, the taper, and for
    // the flat tip the width swinging with the direction of travel, which a
    // straight line would hide completely.
    const steps = 90
    const path = Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps
      return {
        wx: bandX + BAND_W * (0.06 + t * 0.88),
        wy: bandY + BAND_H * (0.5 + Math.sin(t * Math.PI * 2) * 0.17),
        force: 0.05 + t * 0.95,
      }
    })

    //  is the mask of what is held *after* this event, so a release
    // has to report 0. Sending 1 there leaves the engine believing the pen is
    // still down, and the next gesture's press is then a second press with no
    // release between — which it correctly ignores, so only the first brush
    // ever drew.
    const send = async (type: string, p: typeof path[number], down = true) => {
      const s = toScreen(p.wx, p.wy)
      await cdp.send('Input.dispatchMouseEvent', {
        type, x: s.x, y: s.y, button: 'left', buttons: down ? 1 : 0,
        pointerType: 'pen', force: down ? p.force : 0,
      })
    }
    await send('mousePressed', path[0])
    for (const p of path.slice(1)) await send('mouseMoved', p)
    await send('mouseReleased', path[path.length - 1], false)

    // The stroke is committed on pen-up and the operation appended after it.
    await page.waitForFunction(
      () => window.__engine!.getOperations().some(op => op.type === 'stroke'),
      undefined, { timeout: 15_000 },
    )

    const dataUrl = await page.evaluate(async ({ bandX, bandY, BAND_W, BAND_H, OUT_W, OUT_H }) => {
      // Transparent export: the mark on alpha, with no paper — which is what
      // these assets are (the picker puts its own tint behind them).
      const blob = await window.__engine!.exportPNG(true)
      if (!blob) throw new Error('bake: exportPNG returned nothing')
      const bitmap = await createImageBitmap(blob)
      const canvas = document.createElement('canvas')
      canvas.width = OUT_W
      canvas.height = OUT_H
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, bandX, bandY, BAND_W, BAND_H, 0, 0, OUT_W, OUT_H)
      return canvas.toDataURL('image/png')
    }, { bandX, bandY, BAND_W, BAND_H, OUT_W, OUT_H })

    const png = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64')
    writeFileSync(join(OUT_DIR, id + '.png'), png)
    console.log('baked ' + id + '.png  ' + Math.round(png.length / 1024) + ' KB')
  }

  await browser.close()
  console.log('\nbake:brush-samples ok — ' + BRUSHES.length + ' samples in ' + OUT_DIR)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
