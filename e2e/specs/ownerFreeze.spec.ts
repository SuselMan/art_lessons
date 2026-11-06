import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { io, type Socket } from 'socket.io-client'
import { packDabs, type ClientToServerEvents, type Dab, type ServerToClientEvents } from '../../packages/shared/src'
import type { PencilEngineAPI } from '../../apps/web/src/engine'
import { androidPage } from '../support/androidPage'
import { activeLayerId, createRoom, joinRoom, waitForOperations, waitForRoomReady } from '../support/room'

interface OwnerFreezeProbe { engine: PencilEngineAPI; owner: string; ended: number }
declare global { interface Window { __ownerFreezeProbe?: OwnerFreezeProbe } }
function installProbe() {
  const engine = window.__engine!
  const owner = window.__roomStore!.getState().participants.find(p => p.role === 'owner')!.userId
  const probe: OwnerFreezeProbe = { engine, owner, ended: 0 }
  window.__ownerFreezeProbe = probe
  const end = engine.endPeerLiveStroke.bind(engine)
  engine.endPeerLiveStroke = (...args) => { if (args[0] === owner) probe.ended++; return end(...args) }
}
function readProbe() {
  const color = window.__engine!.pickColor(600, 800)
  return {
    ended: window.__ownerFreezeProbe!.ended,
    sameEngine: window.__ownerFreezeProbe!.engine === window.__engine,
    frozen: window.__roomStore!.getState().roomFrozen,
    darkness: color ? 1 - (color[0] + color[1] + color[2]) / 3 : 0,
    strokes: window.__engine!.getOperations().filter(op => op.type === 'stroke').length,
  }
}

for (const device of ['chromium', 'samsung'] as const) {
  for (const tool of ['pencil', 'marker'] as const) {
    test(`${device} preserves the owner's live ${tool} across freeze and continued packets`, async ({ page, browser }) => {
      test.skip(device === 'samsung' && !process.env.E2E_ANDROID_CDP, 'Requires the paired Samsung; optional in CI')
      test.setTimeout(180_000)
      const room = await createRoom(page)
      await waitForRoomReady(page)
      const layerId = await activeLayerId(page)
      await page.getByRole('button', { name: 'Open Class' }).click()
      const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
      let android: Awaited<ReturnType<typeof androidPage>> | undefined
      let sender: Socket<ServerToClientEvents, ClientToServerEvents> | undefined
      const errors: string[] = []
      try {
        const viewer = await context.newPage()
        viewer.on('pageerror', error => errors.push(error.message))
        let evaluate = async <T>(fn: () => T) => viewer.evaluate(fn)
        if (device === 'samsung') {
          android = await androidPage(process.env.E2E_ANDROID_CDP!, `${new URL(page.url()).origin}/room/${room}`)
          evaluate = android.evaluate
          await expect.poll(() => evaluate(() => !!document.querySelector('form input[type="text"]')), { timeout: 60_000 }).toBe(true)
          await evaluate(() => { (document.querySelector('form input[type="text"]') as HTMLInputElement).focus() })
          await android.call('Input.insertText', { text: 'Owner freeze witness' })
          await evaluate(() => { (document.querySelector('form button[type="submit"]') as HTMLButtonElement).click() })
          await expect.poll(() => evaluate(() => !!window.__engine && getComputedStyle(document.querySelector('canvas')!).pointerEvents !== 'none'), { timeout: 60_000 }).toBe(true)
          const passport = await evaluate(() => {
            const gl = document.querySelector('canvas')!.getContext('webgl')!
            const extension = gl.getExtension('WEBGL_debug_renderer_info')
            return { ua: navigator.userAgent, gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) as string : 'unknown', dpr: devicePixelRatio }
          })
          console.log('Owner freeze Samsung:', JSON.stringify(passport))
          expect(passport.gpu).toMatch(/Adreno/)
        } else await joinRoom(viewer, room, 'Owner freeze witness')
        await evaluate(installProbe)
        const cookie = (await page.context().cookies()).map(c => `${c.name}=${c.value}`).join('; ')
        sender = io(new URL(page.url()).origin, { transports: ['websocket'], extraHeaders: { Cookie: cookie }, forceNew: true, autoConnect: false })
        const socket = sender
        await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect() })
        const joined = await socket.timeout(10_000).emitWithAck('join_room', { roomId: room, name: 'Live owner' })
        if (!joined.ok) throw new Error(joined.error)
        const strokeId = randomUUID()
        const common = { strokeId, layerId, tool, preset: tool === 'pencil' ? 'HB' : 'bullet', color: [0.08, 0.12, 0.6] as [number, number, number] }
        const dabs = (start: number): Dab[] => Array.from({ length: 16 }, (_, i) => ({ x: start + i * 8, y: 800, pressure: 1, tiltX: 0, tiltY: 0, size: 56, aspectRatio: 1, angle: 0, opacity: 0.8, t: i * 20 }))
        const first = dabs(550), second = dabs(700)
        socket.emit('stroke_live', { ...common, packetSeq: 0, dabsPacked: packDabs(first) })
        await expect.poll(async () => (await evaluate(readProbe)).darkness).toBeGreaterThan(0.08)
        const before = await evaluate(readProbe)
        expect(before.strokes).toBe(0)
        const freeze = new Promise<void>(resolve => socket.once('room_frozen_changed', () => resolve()))
        await page.getByRole('button', { name: 'Freeze project' }).click()
        await freeze
        await expect.poll(async () => (await evaluate(readProbe)).frozen).toBe(true)
        const frozen = await evaluate(readProbe)
        expect(frozen).toMatchObject({ ended: 0, sameEngine: true, strokes: 0 })
        expect(frozen.darkness).toBeGreaterThan(0.08)
        socket.emit('stroke_live', { ...common, packetSeq: 1, dabsPacked: packDabs(second) })
        await expect.poll(() => evaluate(() => {
          const color = window.__engine!.pickColor(750, 800)
          return color ? 1 - (color[0] + color[1] + color[2]) / 3 : 0
        })).toBeGreaterThan(0.08)
        const unfreeze = new Promise<void>(resolve => socket.once('room_frozen_changed', () => resolve()))
        await page.getByRole('button', { name: 'Unfreeze project' }).click()
        await unfreeze
        await expect.poll(async () => (await evaluate(readProbe)).frozen).toBe(false)
        expect((await evaluate(readProbe)).ended).toBe(0)
        socket.emit('stroke_live_end', { strokeId })
        const verdict = await socket.timeout(10_000).emitWithAck('operation', { ...common, id: randomUUID(), type: 'stroke', userId: joined.userId, timestamp: Date.now(), dabs: [...first, ...second] })
        expect(verdict).toMatchObject({ ok: true })
        await expect.poll(async () => (await evaluate(readProbe)).strokes).toBe(1)
        expect((await evaluate(readProbe)).darkness).toBeGreaterThan(0.08)
        await waitForOperations(page, 'stroke')
        console.log('Owner freeze result:', JSON.stringify({ device, tool, before, frozen, after: await evaluate(readProbe) }))
        expect(errors).toEqual([])
      } finally { sender?.close(); await android?.close(); await context.close() }
    })
  }
}
