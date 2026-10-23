import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { zipSync, strToU8 } from 'fflate'
import sharp from 'sharp'
import { createRoom, waitForRoomReady, joinRoom } from './support/room'

async function main() {
  const out = process.env.QA_OUTPUT!
  await mkdir(out, { recursive: true })
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const contexts = await Promise.all([0,1,2].map(() => browser.newContext({ baseURL: process.env.QA_URL ?? 'http://127.0.0.1:5386' })))
  const errors: string[] = []
  try {
    const [owner, peer, outsider] = await Promise.all(contexts.map(c => c.newPage()))
    for (const p of [owner,peer,outsider]) p.on('pageerror', e => errors.push(e.message))
    const roomId = await createRoom(owner, 'Библиотека кистей — upload QA806')
    await waitForRoomReady(owner)
    await owner.evaluate(() => window.__roomStore!.getState().setTool('digitalBrush'))
    await owner.getByRole('button', { name: 'Open Tool settings', exact: true }).click()
    const pixels = Buffer.alloc(64 * 64, 255)
    const shape = await sharp(pixels, { raw: { width: 64, height: 64, channels: 1 } }).png().toBuffer()
    const fixture = zipSync({ 'Brush.archive': strToU8('<?xml version="1.0"?><plist version="1.0"><dict><key>name</key><string>QA Private 806</string><key>plotSpacing</key><real>0.25</real></dict></plist>'), 'Shape.png': shape })
    await owner.locator('input[type=file][accept*=".abr"]').setInputFiles({ name: 'QA_Private_806.brush', mimeType: 'application/octet-stream', buffer: Buffer.from(fixture) })
    await expect(owner.getByText('Imported brushes: 1', { exact: true })).toBeVisible({ timeout: 60_000 })
    console.log('UI import completed')
    const metadata = await owner.evaluate(async () => (await fetch('/api/brush-library')).json())
    const privateBrush = metadata.brushes.find((b: { name: string }) => b.name === 'QA Private 806')
    expect(privateBrush).toBeTruthy()
    await outsider.goto('/create')
    const outsiders = await outsider.evaluate(async () => (await fetch('/api/brush-library')).json())
    expect(outsiders.brushes.some((b: { name: string }) => b.name === 'QA Private 806')).toBe(false)
    const hash = privateBrush.descriptor.tip.mask.slice(6)
    expect((await contexts[2].request.get(`/api/brush-library/assets/${hash}`)).status()).toBe(404)
    expect((await contexts[2].request.get(`/api/brush-library?roomId=${roomId}`)).status()).toBe(403)
    await joinRoom(peer, roomId, 'Shared brush reader')
    await expect.poll(async () => (await (await contexts[1].request.get(`/api/brush-library?roomId=${roomId}`)).json()).brushes.some((b: { name: string }) => b.name === 'QA Private 806')).toBe(true)
    expect((await contexts[1].request.get(`/api/brush-library/assets/${hash}?roomId=${roomId}`)).status()).toBe(200)
    console.log('Owner / room / outsider ACL passed')
    const response = await contexts[0].request.get(`/api/rooms/${roomId}/brush-library/export`)
    expect(response.status()).toBe(200)
    const bundle = await response.body()
    const portable = JSON.parse(bundle.toString())
    expect(portable.library.brushes.some((b: { name: string }) => b.name === 'QA Private 806')).toBe(true)
    const uploaded = await contexts[2].request.post('/api/brush-library/imports', { data: bundle, headers: { 'Content-Type': 'application/octet-stream', 'X-Brush-Filename': 'QA.grafetto-brushes.json' } })
    expect(uploaded.status()).toBe(202)
    let job = await uploaded.json()
    await expect.poll(async () => { job = await (await contexts[2].request.get(`/api/brush-library/imports/${job.id}`)).json(); return job.status }, { timeout: 60_000 }).toBe('complete')
    expect(job.library.brushes[0].descriptor).toEqual(privateBrush.descriptor)
    console.log('Portable export / import exact descriptor passed')
    // The real owner-supplied pack exercises large streaming input and process limits.
    const pack = await import('node:fs/promises').then(fs => fs.readFile(`${process.env.HOME}/.local/share/grafetto/brush-import-sources/BB_Realistic_Watercolour.brushset`))
    const actual = await contexts[0].request.post('/api/brush-library/imports', { data: pack, headers: { 'Content-Type': 'application/octet-stream', 'X-Brush-Filename': 'BB_Realistic_Watercolour.brushset' }, timeout: 120_000 })
    expect(actual.status()).toBe(202)
    let real = await actual.json()
    await expect.poll(async () => { real = await (await contexts[0].request.get(`/api/brush-library/imports/${real.id}`)).json(); return real.status }, { timeout: 150_000 }).toBe('complete')
    expect(real.library.brushes.length).toBe(11)
    expect(real.library.skipped.length).toBe(5)
    const otherJob = await contexts[1].request.get(`/api/brush-library/imports/${real.id}`)
    expect(otherJob.status()).toBe(404)
    expect(errors).toEqual([])
    await owner.screenshot({ path: `${out}/library-ui.png` })
    await writeFile(`${out}/report.json`, JSON.stringify({ roomId, privateBrushId: privateBrush.descriptor.id, realBrushes: real.library.brushes.length, skipped: real.library.skipped.length, exportedBytes: bundle.length, pageErrors: errors }, null, 2))
    console.log('PASS upload, private ACL, shared resources, exact portable roundtrip, real 67 MB pack')
  } finally { await Promise.all(contexts.map(c => c.close())); await browser.close() }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
