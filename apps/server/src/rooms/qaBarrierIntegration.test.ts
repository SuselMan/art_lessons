import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { QaActivityGate } from './qaActivityGate.js'
import { QaBackgroundWork } from './qaBackgroundWork.js'
import { registerQaHttpActivityGate } from './qaHttpActivityGate.js'

const container = process.env.QA_ACTIVITY_TEST_CONTAINER
const exec = promisify(execFile)

describe.skipIf(!container)('QA HTTP and detached PostgreSQL activity', () => {
  it('blocks collection after HTTP responds until its actual detached DB query finishes', async () => {
    if (!container || !/^qa-activity-test-[a-z0-9]+$/.test(container)) throw Error('disposable container required')
    const gate = new QaActivityGate(), background = new QaBackgroundWork(gate), app = Fastify()
    registerQaHttpActivityGate(app, gate)
    let job!: Promise<unknown>
    app.post('/room', async () => {
      job = background.start(() => exec('docker', [
        'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT pg_sleep(0.5)',
      ]))
      return { ok: true }
    })
    try {
      expect((await app.inject({ method: 'POST', url: '/room' })).statusCode).toBe(200)
      expect(gate.tryStartCollection()).toBeUndefined()
      await job
      const release = gate.tryStartCollection()
      expect(release).toBeDefined()
      expect(await background.readyForCollection()).toBe(true)
      release?.()
    } finally { if (job) await job.catch(() => {}); await app.close() }
  })
})
