import { describe, expect, it } from 'vitest'
import { QaActivityGate } from './qaActivityGate.js'
import { QaBackgroundWork } from './qaBackgroundWork.js'

describe('QA detached work', () => {
  it('keeps a child lease after the parent returns until the DB write settles', async () => {
    const gate = new QaActivityGate(), jobs = new QaBackgroundWork(gate)
    const parent = gate.tryEnter()!
    let finish!: () => void
    const job = jobs.start(() => new Promise<void>(resolve => { finish = resolve }))
    parent()
    expect(gate.tryStartCollection()).toBeUndefined()
    finish(); await job
    const collection = gate.tryStartCollection()!
    expect(collection).toBeDefined()
    expect(await jobs.readyForCollection()).toBe(true)
    collection()
  })

  it('latches errors and does not start work when collection already holds the gate', async () => {
    const gate = new QaActivityGate(), jobs = new QaBackgroundWork(gate)
    await expect(jobs.start(async () => { throw Error('DB error') })).rejects.toThrow('DB error')
    expect(await jobs.readyForCollection()).toBe(false)
    const finish = gate.tryStartCollection()!
    let ran = false
    await expect(jobs.start(async () => { ran = true })).rejects.toThrow('QA collection')
    expect(ran).toBe(false)
    expect(await jobs.readyForCollection()).toBe(false)
    finish()
  })
})
