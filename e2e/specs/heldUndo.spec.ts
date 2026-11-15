import { expect, test } from '@playwright/test'
import { androidPage } from '../support/androidPage'
import { createRoom, drawStroke, joinRoom, operations, waitForOperations, waitForRoomReady } from '../support/room'

interface HeldUndoEngine {
  _onStart(sample: object): void
  _onMove(sample: object): void
  _onEnd(sample: object): void
  _strokeId: string | null
  _liveDabQueue: unknown[]
}
interface SnapshotRefusal { status: number; code: string }
declare global { interface Window { __undoSnapshotRefusals?: SnapshotRefusal[] } }
function installSnapshotProbe() {
  const original = window.fetch.bind(window)
  window.__undoSnapshotRefusals = []
  window.fetch = async (input, init) => {
    const response = await original(input, init)
    const url = input instanceof Request ? input.url : String(input)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (method.toUpperCase() === 'POST' && /\/snapshots$/.test(url) && !response.ok) {
      const body = await response.clone().json() as { error?: string }
      window.__undoSnapshotRefusals!.push({ status: response.status, code: body.error ?? 'unknown' })
    }
    return response
  }
}
function beginHeld() {
  window.__engine!.setSize(24)
  const engine = window.__engine as unknown as HeldUndoEngine
  const sample = (x: number) => ({ x, y: 1200, pressure: 1, tiltX: 0, tiltY: 0, speed: 0, pointerType: 'pen', timeStamp: performance.now() })
  engine._onStart(sample(800))
  for (const x of [850, 900, 950]) engine._onMove(sample(x))
  return engine._strokeId
}
function sampleHeld() {
  const color = window.__engine!.pickColor(850, 1200)
  return { darkness: color ? 1 - (color[0] + color[1] + color[2]) / 3 : 0,
    queued: (window.__engine as unknown as HeldUndoEngine)._liveDabQueue.length,
    strokes: window.__engine!.getOperations().filter(op => op.type === 'stroke').length }
}
function finishHeld() {
  (window.__engine as unknown as HeldUndoEngine)._onEnd({ x: 950, y: 1200, pressure: 1, tiltX: 0, tiltY: 0, speed: 0, pointerType: 'pen', timeStamp: performance.now() })
}

for (const device of ['chromium', 'samsung'] as const) {
  test(`Undo preserves a held ${device} participant stroke locally and on its peer`, async ({ page, browser }) => {
    test.skip(device === 'samsung' && !process.env.E2E_ANDROID_CDP, 'Requires the paired Samsung; optional in CI')
    test.setTimeout(180_000)
    const room = await createRoom(page)
    await waitForRoomReady(page)
    await page.evaluate(installSnapshotProbe)
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    let android: Awaited<ReturnType<typeof androidPage>> | undefined
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      const author = await context.newPage()
      author.on('pageerror', error => errors.push(error.message))
      let evaluate = async <T>(fn: () => T) => author.evaluate(fn)
      if (device === 'samsung') {
        android = await androidPage(process.env.E2E_ANDROID_CDP!, `${new URL(page.url()).origin}/room/${room}`)
        evaluate = android.evaluate
        await expect.poll(() => evaluate(() => !!document.querySelector('form input[type="text"]')), { timeout: 60_000 }).toBe(true)
        await evaluate(() => { (document.querySelector('form input[type="text"]') as HTMLInputElement).focus() })
        await android.call('Input.insertText', { text: 'Held Undo author' })
        await evaluate(() => { (document.querySelector('form button[type="submit"]') as HTMLButtonElement).click() })
        await expect.poll(() => evaluate(() => !!window.__engine && getComputedStyle(document.querySelector('canvas')!).pointerEvents !== 'none'), { timeout: 60_000 }).toBe(true)
        const passport = await evaluate(() => {
          const gl = document.querySelector('canvas')!.getContext('webgl')!
          const ext = gl.getExtension('WEBGL_debug_renderer_info')
          return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string : 'unknown', ua: navigator.userAgent, dpr: devicePixelRatio }
        })
        console.log('Held Undo Samsung:', JSON.stringify(passport))
        expect(passport.gpu).toMatch(/Adreno/)
      } else await joinRoom(author, room, 'Held Undo author')
      await evaluate(installSnapshotProbe)
      // A real owner's CDP stroke is the Undo target. The other participant
      // remains physically mid-gesture when that control reaches both engines.
      await drawStroke(page, [[500, 250], [580, 280]])
      await waitForOperations(page, 'stroke')
      await expect.poll(async () => (await evaluate(sampleHeld)).strokes).toBe(1)
      const old = (await operations(page)).find(op => op.type === 'stroke')!.id
      const held = await evaluate(beginHeld)
      expect(held).toBeTruthy()
      await expect.poll(async () => (await evaluate(sampleHeld)).queued).toBe(0)
      await expect.poll(async () => (await evaluate(sampleHeld)).darkness).toBeGreaterThan(0.08)
      await expect.poll(async () => (await page.evaluate(sampleHeld)).darkness).toBeGreaterThan(0.08)
      const before = { local: await evaluate(sampleHeld), peer: await page.evaluate(sampleHeld) }
      await page.keyboard.press('Control+z')
      await expect.poll(async () => (await operations(page)).some(op => op.id === old)).toBe(false)
      await expect.poll(async () => (await evaluate(sampleHeld)).strokes).toBe(0)
      const during = { local: await evaluate(sampleHeld), peer: await page.evaluate(sampleHeld) }
      expect(during.local.darkness).toBeGreaterThan(0.08)
      expect(during.peer.darkness).toBeGreaterThan(0.08)
      await evaluate(finishHeld)
      await waitForOperations(page, 'stroke')
      await expect.poll(async () => (await evaluate(sampleHeld)).strokes).toBe(1)
      await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
      const current = (await operations(page)).filter(op => op.type === 'stroke')
      expect(current).toHaveLength(1)
      expect(current[0]).toMatchObject({ strokeId: held })
      await expect.poll(async () => {
        const response = await page.request.get(`/api/rooms/${room}/operations?beforeSeq=10000&limit=500`)
        expect(response.status()).toBe(200)
        const data = await response.json() as { type: string; strokeId?: string }[]
        return data.some(op => op.type === 'stroke' && op.strokeId === held)
      }).toBe(true)
      const after = { local: await evaluate(sampleHeld), peer: await page.evaluate(sampleHeld) }
      expect(after.local.darkness).toBeGreaterThan(0.08)
      expect(after.peer.darkness).toBeGreaterThan(0.08)
      const refusals = { local: await evaluate(() => window.__undoSnapshotRefusals!), peer: await page.evaluate(() => window.__undoSnapshotRefusals!) }
      for (const entry of [...refusals.local, ...refusals.peer]) expect(entry).toEqual({ status: 400, code: 'not_a_checkpoint_seq' })
      console.log('Held Undo:', JSON.stringify({ device, before, during, after, refusals }))
      expect(errors).toEqual([])
    } finally { await android?.close(); await context.close() }
  })
}
