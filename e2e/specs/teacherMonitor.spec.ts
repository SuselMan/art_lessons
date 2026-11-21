import { expect, test } from '@playwright/test'
import { createRoom, drawStroke, joinRoom, waitForOperations, waitForRoomReady } from '../support/room'

test('teacher monitor keeps the student on their board and stops rendering when minimized', { tag: '@two-browsers' }, async ({ page: teacher, browser }) => {
  test.setTimeout(180_000)
  const lesson = await createRoom(teacher)
  await waitForRoomReady(teacher)
  const context = await browser.newContext()
  try {
    const student = await context.newPage()
    await joinRoom(student, lesson, 'Alice')
    await teacher.getByRole('button', { name: /^Open Class/ }).click()
    await teacher.getByRole('button', { name: 'New assignment', exact: true }).click()
    await teacher.getByRole('button', { name: 'Hand out', exact: true }).click()
    await student.waitForFunction(id => window.__roomStore!.getState().boardId !== id, lesson)
    await waitForRoomReady(student)
    const personal = await student.evaluate(() => window.__roomStore!.getState().boardId)
    await student.getByRole('button', { name: /^Open Class/ }).click()
    // Sending the class to an assignment opens the teacher view automatically.
    await expect(student.locator('iframe[title="Teacher\'s board"]')).toHaveCount(1)
    const monitor = student.frameLocator('iframe[title="Teacher\'s board"]')
    await expect.poll(() => monitor.locator('canvas').count()).toBeGreaterThan(0)
    const frame = student.frames().find(f => f.url().includes('?observe='))!
    await frame.waitForFunction(() => !!window.__engine)
    expect(await frame.evaluate(() => window.__roomStore!.getState().boardId)).toBe(lesson)
    expect(await student.evaluate(() => window.__roomStore!.getState().boardId)).toBe(personal)
    expect(await teacher.evaluate(() => window.__roomStore!.getState().participants.length)).toBe(2)
    await drawStroke(teacher, [[400, 330], [700, 350]])
    await waitForOperations(teacher, 'stroke', 1)
    await expect.poll(() => frame.evaluate(() => window.__engine!.getOperations().filter(op => op.type === 'stroke').length)).toBe(1)
    // Prove that the iframe paints live packets while the pen is still down.
    await frame.waitForFunction(() => !!window.__liveLatency)
    const canvasBox = (await teacher.locator('canvas').first().boundingBox())!
    await teacher.mouse.move(canvasBox.x + 400, canvasBox.y + 400)
    await teacher.mouse.down()
    try {
      for (let i = 1; i <= 12; i++) {
        await teacher.mouse.move(canvasBox.x + 400 + i * 12, canvasBox.y + 400)
        await teacher.waitForTimeout(40)
      }
      await expect.poll(() => frame.evaluate(() => window.__liveLatency!.stats()?.count ?? 0)).toBeGreaterThan(0)
    } finally { await teacher.mouse.up() }
    await waitForOperations(teacher, 'stroke', 2)
    await student.getByRole('button', { name: /^Collapse Class/ }).click()
    await expect(student.locator('iframe')).toHaveCount(1)
    await drawStroke(student, [[420, 420], [720, 440]])
    await waitForOperations(student, 'stroke', 1)
    await student.screenshot({ path: 'temp/teacher-monitor/monitor.png' })
    await student.getByRole('button', { name: 'Minimize', exact: true }).click()
    await expect(student.locator('iframe')).toHaveCount(0)
    await student.getByRole('button', { name: 'Expand', exact: true }).click()
    await expect(student.locator('iframe')).toHaveCount(1)
    await student.getByRole('button', { name: 'Close viewer', exact: true }).click()
    await expect(student.locator('iframe')).toHaveCount(0)
    expect(await teacher.evaluate(() => window.__roomStore!.getState().participants.length)).toBe(2)
    expect(await student.evaluate(() => window.__roomStore!.getState().boardId)).toBe(personal)
  } finally { await context.close().catch(() => {}) }
})
