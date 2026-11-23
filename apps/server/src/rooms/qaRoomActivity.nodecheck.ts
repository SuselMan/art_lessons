import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { QaRoomActivity, type QaRoomActivityStore } from './qaRoomActivity.js'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

test('before initialization collection is unsafe, every restart resets all clocks', async () => {
  let reset = 0
  const store: QaRoomActivityStore = { async resetAll() { reset++ }, async touch() {} }
  const first = new QaRoomActivity(store)
  assert.equal(await first.readyForCollection(), false)
  await first.start()
  assert.equal(await first.readyForCollection(), true)
  const afterCrash = new QaRoomActivity(store)
  assert.equal(await afterCrash.readyForCollection(), false)
  await afterCrash.start()
  assert.equal(reset, 2)
})

test('collection waits for departures and serializes rapid rejoin', async () => {
  const gate = deferred(), events: string[] = []
  const store: QaRoomActivityStore = {
    async resetAll() {},
    async touch(id) { events.push('start ' + id); if (events.length === 1) await gate.promise; events.push('end ' + id) },
  }
  const tracker = new QaRoomActivity(store)
  await tracker.start()
  tracker.touch('departure'); tracker.touch('rejoin')
  let ready = false
  const pending = tracker.readyForCollection().then(value => { ready = value })
  await Promise.resolve(); await Promise.resolve()
  assert.deepEqual(events, ['start departure'])
  assert.equal(ready, false)
  gate.resolve(); await pending
  assert.equal(ready, true)
  assert.deepEqual(events, ['start departure', 'end departure', 'start rejoin', 'end rejoin'])
})

test('failure to reset or persist a clock permanently disables collection', async () => {
  const badReset = new QaRoomActivity({ async resetAll() { throw Error('db unavailable') }, async touch() {} })
  await assert.rejects(badReset.start())
  assert.equal(await badReset.readyForCollection(), false)
  const badWrite = new QaRoomActivity({ async resetAll() {}, async touch() { throw Error('db unavailable') } })
  await badWrite.start()
  const original = console.error
  try {
    console.error = () => {}
    badWrite.touch('lesson')
    assert.equal(await badWrite.readyForCollection(), false)
    assert.equal(await badWrite.readyForCollection(), false)
  } finally { console.error = original }
})
