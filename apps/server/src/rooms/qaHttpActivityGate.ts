import type { FastifyInstance, FastifyRequest } from 'fastify'
import { QaActivityGate, type ReleaseQaActivity } from './qaActivityGate.js'

/** Install before listening, and only after the dedicated QA DB lease is held.
 * A failed/aborted response may leak its lease; this is deliberately fail
 * closed: it prevents collection until restart rather than losing work.
 * This tracks HTTP only; socket handlers and detached writes need their own
 * leases for their full lifetimes before any collector may be enabled. */
export function registerQaHttpActivityGate(app: FastifyInstance, gate: QaActivityGate): void {
  const leases = new WeakMap<FastifyRequest, ReleaseQaActivity>()
  app.addHook('onRequest', async (request, reply) => {
    const release = gate.tryEnter()
    if (!release) {
      return reply.code(503).send({ error: 'qa_maintenance_retry' })
    }
    leases.set(request, release)
  })
  app.addHook('onResponse', async request => {
    leases.get(request)?.()
    leases.delete(request)
  })
}
