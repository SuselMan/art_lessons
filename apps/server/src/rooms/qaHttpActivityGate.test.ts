import { describe, expect, it } from 'vitest'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { QaActivityGate } from './qaActivityGate.js'
import { registerQaHttpActivityGate } from './qaHttpActivityGate.js'

type Hook = (request: FastifyRequest, reply: { code(n: number): { send(body: unknown): unknown } }) => Promise<unknown>
function fakeServer() {
  const hooks = new Map<string, Hook>()
  const app = { addHook(name: string, hook: Hook) { hooks.set(name, hook) } } as unknown as FastifyInstance
  let status = 200
  const reply = { code(n: number) { status = n; return { send(body: unknown) { return body } } } }
  return { app, hooks, reply, status: () => status }
}

describe('QA HTTP barrier', () => {
  it('holds requests until response, rejecting a collector in the meantime', async () => {
    const gate = new QaActivityGate(), server = fakeServer()
    registerQaHttpActivityGate(server.app, gate)
    const req = {} as FastifyRequest
    await server.hooks.get('onRequest')!(req, server.reply)
    expect(gate.tryStartCollection()).toBeUndefined()
    await server.hooks.get('onResponse')!(req, server.reply)
    const finish = gate.tryStartCollection()
    expect(finish).toBeDefined()
    finish?.()
  })

  it('rejects requests during collection and lets them retry afterwards', async () => {
    const gate = new QaActivityGate(), server = fakeServer()
    registerQaHttpActivityGate(server.app, gate)
    const finish = gate.tryStartCollection()!
    const rejected = {} as FastifyRequest
    expect(await server.hooks.get('onRequest')!(rejected, server.reply)).toEqual({ error: 'qa_maintenance_retry' })
    expect(server.status()).toBe(503)
    await server.hooks.get('onResponse')!(rejected, server.reply)
    expect(gate.tryEnter()).toBeUndefined()
    finish()
    const req = {} as FastifyRequest
    await server.hooks.get('onRequest')!(req, server.reply)
    expect(gate.tryStartCollection()).toBeUndefined()
    await server.hooks.get('onResponse')!(req, server.reply)
  })

  it('fails closed if an aborted request never reaches response', async () => {
    const gate = new QaActivityGate(), server = fakeServer()
    registerQaHttpActivityGate(server.app, gate)
    await server.hooks.get('onRequest')!({} as FastifyRequest, server.reply)
    expect(gate.tryStartCollection()).toBeUndefined()
  })
})

it('holds an actual Fastify request until its async response completes', async () => {
  const { default: Fastify } = await import('fastify')
  const app = Fastify(), gate = new QaActivityGate()
  registerQaHttpActivityGate(app, gate)
  let started!: () => void, finishWork!: () => void
  const startedPromise = new Promise<void>(resolve => { started = resolve })
  const pendingWork = new Promise<void>(resolve => { finishWork = resolve })
  app.get('/room', async () => { started(); await pendingWork; return { ok: true } })
  try {
    const request = app.inject({ method: 'GET', url: '/room' })
    await startedPromise
    expect(gate.tryStartCollection()).toBeUndefined()
    finishWork()
    expect((await request).statusCode).toBe(200)
    const collection = gate.tryStartCollection()!
    expect(collection).toBeDefined()
    expect((await app.inject({ method: 'GET', url: '/room' })).statusCode).toBe(503)
    collection()
  } finally { finishWork(); await app.close() }
})
