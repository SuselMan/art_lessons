import { describe, expect, it } from 'vitest'
import { QaActivityGate, tryRunQaActivity } from './qaActivityGate.js'

describe('QA activity barrier', () => {
  it('blocks collection for the entire asynchronous HTTP or socket operation', async () => {
    const gate = new QaActivityGate()
    const release = gate.tryEnter()
    expect(release).toBeDefined()
    await Promise.resolve()
    expect(gate.tryStartCollection()).toBeUndefined()
    release?.()
    const done = gate.tryStartCollection()
    expect(done).toBeDefined()
    done?.()
  })

  it('rejects new joins, HTTP and overlapping collectors throughout deletion', async () => {
    const gate = new QaActivityGate()
    const finish = gate.tryStartCollection()
    expect(finish).toBeDefined()
    await Promise.resolve()
    expect(gate.tryEnter()).toBeUndefined()
    expect(gate.tryStartCollection()).toBeUndefined()
    finish?.()
    const release = gate.tryEnter()
    expect(release).toBeDefined()
    release?.()
  })

  it('requires every independent operation to finish and tolerates duplicate cleanup', () => {
    const gate = new QaActivityGate()
    const first = gate.tryEnter()!
    const second = gate.tryEnter()!
    first(); first()
    expect(gate.tryStartCollection()).toBeUndefined()
    second(); second()
    const finish = gate.tryStartCollection()!
    expect(finish).toBeDefined()
    finish(); finish()
    const again = gate.tryStartCollection()
    expect(again).toBeDefined()
    again?.()
  })
})


it('holds asynchronous socket or background work and releases even on failure', async () => {
  const gate = new QaActivityGate()
  let finish!: () => void
  const work = new Promise<void>(resolve => { finish = resolve })
  const result = tryRunQaActivity(gate, async () => { await work; throw Error('failed') })
  expect(result.admitted).toBe(true)
  if (!result.admitted) throw Error('not admitted')
  expect(gate.tryStartCollection()).toBeUndefined()
  finish()
  await expect(result.result).rejects.toThrow('failed')
  const cleanup = gate.tryStartCollection()
  expect(cleanup).toBeDefined()
  expect(tryRunQaActivity(gate, () => { throw Error('must not run') })).toEqual({ admitted: false })
  cleanup?.()
})
