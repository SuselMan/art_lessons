import { chromium, expect as baseExpect } from '@playwright/test'
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRoom, waitForRoomReady, joinRoom, drawStroke, waitForOperations } from './support/room'

const expect = baseExpect.configure({ timeout: 30_000 })

async function main(): Promise<void> {
const out = process.env.QA_OUTPUT ?? 'temp/brush-import-qa'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errors: string[] = []
const httpErrors: { path: string; status: number; body: string }[] = []
const baseline = process.env.QA_BASELINE === '1'
const contexts = await Promise.all([0, 1].map(() => browser.newContext({ baseURL: process.env.QA_URL ?? 'http://127.0.0.1:5386', viewport: { width: 1365, height: 900 } })))
try {
  const [teacher, student] = await Promise.all(contexts.map(c => c.newPage()))
  const downloads: string[][] = [[], []]
  for (const [i, page] of [teacher, student].entries()) {
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text()) })
    page.on('response', async response => { if (response.status() >= 400) httpErrors.push({ path: new URL(response.url()).pathname, status: response.status(), body: await response.text().catch(() => '') }) })
    page.on('request', r => { if (r.url().includes('/api/brush-library/assets/')) downloads[i].push(r.url()) })
  }
  const id = await createRoom(teacher, 'Импорт кистей — QA806')
  await waitForRoomReady(teacher)
  await writeFile(`${out}/room-id`, id)
  expect(downloads[0]).toHaveLength(0)
  const library = await teacher.evaluate(async () => (await fetch('/api/brush-library')).json())
  library.brushes.sort((a:{descriptor:{version:number}},b:{descriptor:{version:number}})=>b.descriptor.version-a.descriptor.version)
  const abr = baseline ? { name: 'Hard Round', source: 'builtin', descriptor: { id: 'hard-round' } } : library.brushes.find((b: { source: string; descriptor: { behavior?: unknown } }) => b.source.endsWith('.abr') && b.descriptor.behavior)
  const procreate = baseline ? { name: 'Soft Round', source: 'builtin', descriptor: { id: 'soft-round' } } : library.brushes.find((b: { source: string; name: string; descriptor: { behavior?: unknown } }) => b.source.endsWith('.brushset') && b.name === 'Main Brush' && b.descriptor.behavior)
  if (!abr || !procreate) throw new Error('Expected both real source formats in the QA catalog')
  await joinRoom(student, id, 'Ученик QA')
  console.log('Both clients ready')
  expect(downloads[1]).toHaveLength(0)

  for (const [i, brush] of [abr, procreate].entries()) {
    console.log('Selecting', brush.name)
    await teacher.evaluate(() => window.__roomStore!.getState().setTool('digitalBrush'))
    if (baseline) {
      await teacher.evaluate(id => window.__roomStore!.getState().setToolSetting('digitalBrush', 'brush', id), brush.descriptor.id)
    } else {
      await teacher.getByRole('button', { name: /^(Brush|Кисть)$/ }).first().click()
      await teacher.getByRole('option', { name: `${brush.source.endsWith('.abr') ? 'ABR' : 'Procreate'} · ${brush.name}`, exact: true }).click()
    }
    await expect.poll(() => teacher.evaluate(() => window.__roomStore!.getState().toolSettings.digitalBrush.brush)).toBe(brush.descriptor.id)
    await drawStroke(teacher, [[350, 300 + i * 160], [470, 260 + i * 160], [600, 330 + i * 160], [760, 280 + i * 160]], { size: 120 })
    await waitForOperations(teacher, 'stroke', i + 1)
    await expect.poll(() => student.evaluate(() => window.__engine!.getOperations().filter(o => o.type === 'stroke').length), { timeout: 60_000 }).toBeGreaterThanOrEqual(i + 1)
  }
  await teacher.screenshot({ path: `${out}/teacher.png` })
  await student.screenshot({ path: `${out}/student.png` })
  const tokens = await teacher.evaluate(() => window.__engine!.getOperations().filter(o => o.type === 'stroke').map(o => o.preset))
  expect(tokens.every(t => t?.startsWith(baseline ? 'brush:' : 'brush:imported-'))).toBe(true)
  const exportPixels = async (page: typeof teacher) => {
    const bytes = await page.evaluate(async () => {
      const blob = await window.__engine!.exportPNG()
      if (!blob) throw new Error('No export')
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result.split(',')[1]) : reject(new Error('No encoded export'))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
    })
    return sharp(Buffer.from(bytes, 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  }
  const comparisons: Record<string, { changed: number; max: number }> = {}
  const compare = (name: string, a: Awaited<ReturnType<typeof exportPixels>>, b: Awaited<ReturnType<typeof exportPixels>>) => {
    expect(a.info).toEqual(b.info)
    let changed = 0, max = 0
    for (let i = 0; i < a.data.length; i += 4) {
      let delta = 0
      for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(a.data[i+c] - b.data[i+c]))
      if (delta) changed++
      max = Math.max(max, delta)
    }
    comparisons[name] = { changed, max }
    expect(max, name).toBeLessThanOrEqual(1)
    expect(changed, name).toBeLessThanOrEqual(256)
  }
  console.log('Comparing live exports')
  const before = await exportPixels(teacher)
  compare('live-peer', before, await exportPixels(student))
  console.log('Checking undo')
  await teacher.keyboard.press('Control+z')
  await waitForOperations(student, 'operation_undo')
  const undone = await exportPixels(teacher)
  expect(Buffer.compare(undone.data, before.data)).not.toBe(0)
  compare('undo-peer', undone, await exportPixels(student))
  console.log('Checking redo', await teacher.evaluate(() => ({ operations: window.__engine!.getOperations().map(o => ({ id:o.id,type:o.type,user:o.userId })), focus:document.activeElement?.tagName })))
  const redoButton=teacher.getByRole('button', { name: /^Redo/ }).first()
  await expect(redoButton).toBeEnabled()
  await redoButton.click()
  await expect.poll(() => student.evaluate(() => window.__engine!.getOperations().filter(o => o.type === 'operation_redo').length), { timeout: 60_000 }).toBeGreaterThanOrEqual(1)
  compare('redo-peer', before, await exportPixels(student))
  console.log('Checking reload')
  await student.reload()
  await student.locator('form input[type="text"]').first().fill('Ученик QA после перезахода')
  await student.locator('form button[type="submit"]').click()
  await waitForRoomReady(student)
  compare('reload-peer', before, await exportPixels(student))
  expect(errors).toEqual([])
  const unexpectedHttp = httpErrors.filter(e => !(e.path.endsWith('/thumbnail') && [403,429].includes(e.status)) && !(e.path.endsWith('/snapshots') && e.status === 400 && e.body.includes('not_a_checkpoint_seq')))
  expect(unexpectedHttp).toEqual([])
  await writeFile(`${out}/browser-report.json`, JSON.stringify({ roomId: id, brushNames: [abr.name, procreate.name], tokens, downloads: downloads.map(d => ({ requests: d.length, unique: new Set(d).size })), comparisons, errors, httpErrors, baseline, sameBrowserGpuOnly: true }, null, 2))
  console.log(`PASS: ${baseline ? 'built-in baseline' : 'real ABR and Procreate selection'}, live collaboration, pixel comparisons, undo/redo, reload; no page errors`)
} catch (error) {
  for (const [i, context] of contexts.entries()) for (const page of context.pages()) await page.screenshot({ path: `${out}/failure-${i}.png` }).catch(() => {})
  await writeFile(`${out}/browser-errors.json`, JSON.stringify({ errors, httpErrors, error: String(error) }, null, 2))
  throw error
} finally {
  await Promise.all(contexts.map(c => c.close()))
  await browser.close()
}

}
void main().catch(error => { console.error(error); process.exitCode = 1 })
