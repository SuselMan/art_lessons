import { expect, test } from '@playwright/test'
import { androidPage } from '../support/androidPage'
import type { Dab } from '../../packages/shared/src'
import type { PeerLivePacket } from '../../apps/web/src/engine'
import { activeLayerId, contentBounds, createRoom, joinRoom, waitForOperations, waitForRoomReady } from '../support/room'

interface ProbeEngine {
  _onStart(sample: object): void
  _onMove(sample: object): void
  _onEnd(sample: object): void
  _onLiveStrokeDabs?: (packet: PeerLivePacket) => void
  _liveDabQueue: Dab[]
  _strokeId: string | null
}
interface Probe {
  packets: { seq: number; count: number; at: number }[]
  original?: (packet: PeerLivePacket) => void
  strokeId: string | null
  queued: number
}
declare global { interface Window { __heldProbe?: Probe } }

// The same synchronous pointer-handler burst on software GL and Adreno.
// No fake clock, timer override, fabricated outgoing packet or synthetic DOM
// event: this is the engine pointer pipeline used by the device penbench.
function beginHeldProbe() {
  window.__engine!.setSize(24)
  const engine = window.__engine as unknown as ProbeEngine
  const probe: Probe = { packets: [], original: engine._onLiveStrokeDabs, strokeId: null, queued: 0 }
  window.__heldProbe = probe
  engine._onLiveStrokeDabs = packet => {
    probe.packets.push({ seq: packet.packetSeq, count: packet.dabs.length, at: performance.now() })
    probe.original?.(packet)
  }
  const sample = (x: number) => ({ x, y: 600, pressure: 1, tiltX: 0, tiltY: 0, speed: 0, pointerType: 'pen', timeStamp: performance.now() })
  engine._onStart(sample(400))
  for (const x of [450, 500, 550]) engine._onMove(sample(x))
  probe.strokeId = engine._strokeId
  probe.queued = engine._liveDabQueue.length
  return { strokeId: probe.strokeId, queued: probe.queued, packets: probe.packets }
}
function readHeldProbe() {
  const engine = window.__engine as unknown as ProbeEngine
  return { strokeId: engine._strokeId, queued: engine._liveDabQueue.length, packets: window.__heldProbe!.packets }
}
function finishHeldProbe() {
  const engine = window.__engine as unknown as ProbeEngine
  engine._onEnd({ x: 550, y: 600, pressure: 1, tiltX: 0, tiltY: 0, speed: 0, pointerType: 'pen', timeStamp: performance.now() })
  engine._onLiveStrokeDabs = window.__heldProbe!.original
}

for (const device of ['chromium', 'samsung'] as const) {
  test(`paused held tail drains without pointer input on ${device}`, async ({ page, browser }) => {
    test.skip(device === 'samsung' && !process.env.E2E_ANDROID_CDP, 'Samsung CDP is optional; never substitute software GL for Adreno')
    test.setTimeout(180_000)
    const room = await createRoom(page)
    await waitForRoomReady(page)
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    let android: Awaited<ReturnType<typeof androidPage>> | undefined
    try {
      const author = await context.newPage()
      let evaluate = async <T>(fn: () => T) => author.evaluate(fn)
      if (device === 'samsung') {
        android = await androidPage(process.env.E2E_ANDROID_CDP!, `${new URL(page.url()).origin}/room/${room}`)
        evaluate = android.evaluate
        await expect.poll(() => evaluate(() => !!document.querySelector('form input[type="text"]')), { timeout: 60_000 }).toBe(true)
        await evaluate(() => { (document.querySelector('form input[type="text"]') as HTMLInputElement).focus() })
        await android.call('Input.insertText', { text: 'Samsung held tail' })
        await evaluate(() => { (document.querySelector('form button[type="submit"]') as HTMLButtonElement).click() })
        await expect.poll(() => evaluate(() => !!window.__engine && getComputedStyle(document.querySelector('canvas')!).pointerEvents !== 'none'), { timeout: 60_000 }).toBe(true)
        const passport = await evaluate(() => {
          const gl = document.querySelector('canvas')!.getContext('webgl')!
          const info = gl.getExtension('WEBGL_debug_renderer_info')
          return { ua: navigator.userAgent, gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) as string : 'unknown', dpr: devicePixelRatio, width: innerWidth, height: innerHeight }
        })
        console.log('Samsung passport:', JSON.stringify(passport))
        expect(passport.gpu).toMatch(/Adreno/)
      } else await joinRoom(author, room, 'Held author')
      const initial = await evaluate(beginHeldProbe)
      expect(initial.queued).toBeGreaterThan(0)
      expect(initial.packets.length).toBeGreaterThanOrEqual(1)
      await expect.poll(() => evaluate(readHeldProbe)).toMatchObject({ strokeId: initial.strokeId, queued: 0 })
      const drained = await evaluate(readHeldProbe)
      expect(drained.packets).toHaveLength(initial.packets.length + 1)
      expect(drained.packets.at(-1)!.count).toBe(initial.queued)
      expect(drained.packets.at(-1)!.seq).toBe(initial.packets.at(-1)!.seq + 1)
      expect(drained.packets.at(-1)!.at - initial.packets.at(-1)!.at).toBeGreaterThanOrEqual(59)
      expect(await evaluate(() => window.__engine!.getOperations().filter(op => op.type === 'stroke').length)).toBe(0)
      const layer = await activeLayerId(page)
      await expect.poll(() => contentBounds(page, layer)).not.toBeNull()
      expect(await page.evaluate(() => window.__engine!.getOperations().filter(op => op.type === 'stroke').length)).toBe(0)
      console.log('Held tail:', JSON.stringify({ device, initial, drained }))
      await evaluate(finishHeldProbe)
      await waitForOperations(page, 'stroke')
      expect(await page.evaluate(id => window.__engine!.getOperations().some(op => op.type === 'stroke' && op.strokeId === id), initial.strokeId)).toBe(true)
    } finally { await android?.close(); await context.close() }
  })
}
